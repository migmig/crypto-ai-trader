// 그리드 서치: 10개 코인 × 1년치 15분봉 × 100개 룰 전략 = 1,000 백테스트.
// 데이터는 ../data/KRW-*.csv (simulations/scripts/05_fetch_year_data.py가 사전 다운로드).
// 결과는 ../results/05_grid_search.csv.
//
// 병렬: runtime.NumCPU() 워커로 백테스트 분산.
package main

import (
	"encoding/csv"
	"flag"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ─────────────────────────────────────────────────────────
// 설정 — 실제 signals.py / config.json과 맞춤
// ─────────────────────────────────────────────────────────
const (
	feeRate      = 0.0005
	rsiPeriod    = 14
	macdFast     = 12
	macdSlow     = 26
	macdSignal   = 9
	bbPeriod     = 20
	bbStdMul     = 2.0
	volMAPeriod  = 20
	minTradeKRW  = 5000.0
	cashInit     = 10_000_000.0
	singleCoinMax = 0.50 // 평가금 대비 단일 코인 상한
)

// Candle은 15분봉 하나.
type Candle struct {
	T                        time.Time
	Open, High, Low, Close   float64
	Volume                   float64
}

// Indicators는 벡터화된 지표 (캔들 인덱스별).
type Indicators struct {
	RSI       []float64
	Hist      []float64 // MACD histogram
	PrevHist  []float64
	BBU, BBL  []float64
	MA5, MA20 []float64
	VR        []float64 // volume ratio
}

// Rule은 1개 전략.
type Rule struct {
	ID                  int
	BackstopPct         float64 // 예: -0.15
	TrailingPct         float64 // 예: -0.07
	SellStrongMinProfit float64 // 0이면 조건 없음
	BasePct             float64 // buy_strong 시 매수 비율 (equity 대비)
}

// Result는 1개 백테스트 결과.
type Result struct {
	Coin    string
	Rule    Rule
	PnLPct  float64
	NBuys   int
	NSells  int
	MaxDD   float64 // max drawdown %
	Final   float64
}

// ─────────────────────────────────────────────────────────
// CSV I/O
// ─────────────────────────────────────────────────────────

func loadCandles(path string) ([]Candle, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	r := csv.NewReader(f)
	header, err := r.Read()
	if err != nil {
		return nil, err
	}
	col := map[string]int{}
	for i, h := range header {
		col[h] = i
	}
	needed := []string{"t", "open", "high", "low", "close", "volume"}
	for _, n := range needed {
		if _, ok := col[n]; !ok {
			return nil, fmt.Errorf("missing column %s in %s", n, path)
		}
	}
	var out []Candle
	for {
		row, err := r.Read()
		if err != nil {
			break
		}
		t, err := time.Parse("2006-01-02 15:04:05", strings.TrimSpace(row[col["t"]]))
		if err != nil {
			// pandas ISO format fallback
			t, err = time.Parse(time.RFC3339, strings.TrimSpace(row[col["t"]]))
			if err != nil {
				continue
			}
		}
		parse := func(s string) float64 {
			v, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
			return v
		}
		out = append(out, Candle{
			T:      t,
			Open:   parse(row[col["open"]]),
			High:   parse(row[col["high"]]),
			Low:    parse(row[col["low"]]),
			Close:  parse(row[col["close"]]),
			Volume: parse(row[col["volume"]]),
		})
	}
	return out, nil
}

// ─────────────────────────────────────────────────────────
// 벡터화 지표 (pandas ewm/rolling 상응)
// ─────────────────────────────────────────────────────────

func computeIndicators(cs []Candle) Indicators {
	n := len(cs)
	close := make([]float64, n)
	vol := make([]float64, n)
	for i, c := range cs {
		close[i] = c.Close
		vol[i] = c.Volume
	}

	ind := Indicators{
		RSI:      make([]float64, n),
		Hist:     make([]float64, n),
		PrevHist: make([]float64, n),
		BBU:      make([]float64, n),
		BBL:      make([]float64, n),
		MA5:      make([]float64, n),
		MA20:     make([]float64, n),
		VR:       make([]float64, n),
	}
	for i := range ind.RSI {
		ind.RSI[i] = math.NaN()
		ind.Hist[i] = math.NaN()
		ind.PrevHist[i] = math.NaN()
		ind.BBU[i] = math.NaN()
		ind.BBL[i] = math.NaN()
		ind.MA5[i] = math.NaN()
		ind.MA20[i] = math.NaN()
		ind.VR[i] = math.NaN()
	}

	// RSI (Wilder's smoothing via SMA of gains/losses on rolling window — pandas 기본과 동일)
	gains := make([]float64, n)
	losses := make([]float64, n)
	for i := 1; i < n; i++ {
		d := close[i] - close[i-1]
		if d > 0 {
			gains[i] = d
		} else {
			losses[i] = -d
		}
	}
	// rolling mean
	var gSum, lSum float64
	for i := 0; i < n; i++ {
		gSum += gains[i]
		lSum += losses[i]
		if i >= rsiPeriod {
			gSum -= gains[i-rsiPeriod]
			lSum -= losses[i-rsiPeriod]
		}
		if i >= rsiPeriod {
			avgG := gSum / rsiPeriod
			avgL := lSum / rsiPeriod
			if avgL == 0 {
				ind.RSI[i] = 100
			} else {
				rs := avgG / avgL
				ind.RSI[i] = 100 - 100/(1+rs)
			}
		}
	}

	// MACD: EMA(fast) - EMA(slow), signal = EMA of MACD
	emaFast := ema(close, macdFast)
	emaSlow := ema(close, macdSlow)
	macdLine := make([]float64, n)
	for i := range macdLine {
		macdLine[i] = emaFast[i] - emaSlow[i]
	}
	signalLine := ema(macdLine, macdSignal)
	for i := range ind.Hist {
		ind.Hist[i] = macdLine[i] - signalLine[i]
	}
	for i := 1; i < n; i++ {
		ind.PrevHist[i] = ind.Hist[i-1]
	}

	// Bollinger (20, 2σ)
	var s2 float64
	var rollSum float64
	rollVals := make([]float64, 0, bbPeriod)
	_ = s2
	for i := 0; i < n; i++ {
		rollVals = append(rollVals, close[i])
		rollSum += close[i]
		if len(rollVals) > bbPeriod {
			rollSum -= rollVals[0]
			rollVals = rollVals[1:]
		}
		if len(rollVals) == bbPeriod {
			mean := rollSum / float64(bbPeriod)
			var sq float64
			for _, v := range rollVals {
				sq += (v - mean) * (v - mean)
			}
			std := math.Sqrt(sq / float64(bbPeriod-1)) // pandas default unbiased
			ind.BBU[i] = mean + bbStdMul*std
			ind.BBL[i] = mean - bbStdMul*std
		}
	}

	// MA 5, 20
	ind.MA5 = rollingMean(close, 5)
	ind.MA20 = rollingMean(close, 20)

	// Volume ratio
	volMA := rollingMean(vol, volMAPeriod)
	for i := range ind.VR {
		if !math.IsNaN(volMA[i]) && volMA[i] > 0 {
			ind.VR[i] = vol[i] / volMA[i]
		}
	}

	return ind
}

func ema(x []float64, span int) []float64 {
	// pandas ewm(span=s, adjust=False) 와 일치: alpha = 2/(s+1)
	alpha := 2.0 / float64(span+1)
	out := make([]float64, len(x))
	if len(x) == 0 {
		return out
	}
	out[0] = x[0]
	for i := 1; i < len(x); i++ {
		out[i] = alpha*x[i] + (1-alpha)*out[i-1]
	}
	return out
}

func rollingMean(x []float64, period int) []float64 {
	out := make([]float64, len(x))
	for i := range out {
		out[i] = math.NaN()
	}
	if len(x) < period {
		return out
	}
	var sum float64
	for i := 0; i < period; i++ {
		sum += x[i]
	}
	out[period-1] = sum / float64(period)
	for i := period; i < len(x); i++ {
		sum += x[i] - x[i-period]
		out[i] = sum / float64(period)
	}
	return out
}

// ─────────────────────────────────────────────────────────
// 신호 + 백테스트
// ─────────────────────────────────────────────────────────

type signal int

const (
	sigHold signal = iota
	sigBuyStrong
	sigBuy
	sigSellStrong
	sigSell
)

func signalAt(i int, cs []Candle, ind Indicators) signal {
	rsi := ind.RSI[i]
	hist := ind.Hist[i]
	prev := ind.PrevHist[i]
	bbu := ind.BBU[i]
	bbl := ind.BBL[i]
	ma5 := ind.MA5[i]
	ma20 := ind.MA20[i]
	vr := ind.VR[i]
	price := cs[i].Close
	if math.IsNaN(rsi) || math.IsNaN(hist) || math.IsNaN(prev) ||
		math.IsNaN(bbu) || math.IsNaN(bbl) || math.IsNaN(ma5) || math.IsNaN(ma20) || math.IsNaN(vr) {
		return sigHold
	}
	trend := "횡보"
	if ma5 > ma20 && price > ma5 {
		trend = "상승"
	} else if ma5 < ma20 && price < ma5 {
		trend = "하락"
	}
	golden := prev < 0 && hist >= 0
	rising := prev < 0 && hist > prev
	dead := prev > 0 && hist <= 0
	nearL := price <= bbl*1.02
	nearU := price >= bbu*0.98

	if rsi <= 35 && (golden || rising) && vr >= 1.3 {
		return sigBuyStrong
	}
	if rsi <= 40 && nearL && trend != "하락" {
		return sigBuy
	}
	if rsi >= 70 && dead {
		return sigSellStrong
	}
	if rsi >= 65 && nearU && trend == "하락" {
		return sigSell
	}
	return sigHold
}

// holdBaselinePct: 단순 홀딩(첫 캔들 종가로 전액 매수 → 마지막까지 보유) 수익률.
func holdBaselinePct(cs []Candle) float64 {
	if len(cs) < 2 {
		return 0
	}
	entry := cs[40].Close // 지표 워밍업 후
	exit := cs[len(cs)-1].Close
	// 매수·매도 수수료 반영
	return ((exit*(1-feeRate))/(entry/(1-feeRate)) - 1) * 100
}

func backtest(cs []Candle, ind Indicators, rule Rule) Result {
	cash := cashInit
	qty := 0.0
	cost := 0.0
	peak := 0.0
	nBuys := 0
	nSells := 0
	peakEquity := cashInit
	maxDD := 0.0

	for i := 40; i < len(cs); i++ {
		price := cs[i].Close
		equity := cash + qty*price
		if equity > peakEquity {
			peakEquity = equity
		}
		dd := (equity - peakEquity) / peakEquity
		if dd < maxDD {
			maxDD = dd
		}

		avg := 0.0
		if qty > 0 {
			avg = cost / qty
			if price > avg && price > peak {
				peak = price
			}
		}

		sig := signalAt(i, cs, ind)

		// 매도
		if qty > 0 {
			sellRatio := 0.0
			profit := 0.0
			if avg > 0 {
				profit = price/avg - 1
			}
			switch sig {
			case sigSellStrong:
				if rule.SellStrongMinProfit == 0 || profit >= rule.SellStrongMinProfit {
					sellRatio = 1.0
				}
			case sigSell:
				if rule.SellStrongMinProfit == 0 || profit >= rule.SellStrongMinProfit {
					sellRatio = 0.5
				}
			}
			if sellRatio == 0 && peak > 0 && price > avg*0.99 && price <= peak*(1+rule.TrailingPct) {
				sellRatio = 1.0
			}
			if sellRatio == 0 && avg > 0 && price <= avg*(1+rule.BackstopPct) {
				sellRatio = 1.0
			}
			if sellRatio > 0 {
				sold := qty * sellRatio
				cash += sold * price * (1 - feeRate)
				cost *= (1 - sellRatio)
				qty -= sold
				nSells++
				if qty == 0 {
					peak = 0
				}
			}
		}

		// 매수
		if sig == sigBuyStrong || sig == sigBuy {
			pct := rule.BasePct
			if sig == sigBuy {
				pct = 0.10
			}
			target := equity * pct
			amt := target
			if amt > cash {
				amt = cash
			}
			limit := equity*singleCoinMax - qty*price
			if limit < 0 {
				limit = 0
			}
			if amt > limit {
				amt = limit
			}
			if amt >= minTradeKRW {
				qty += amt / price * (1 - feeRate)
				cost += amt
				cash -= amt
				nBuys++
			}
		}
	}

	final := cash + qty*cs[len(cs)-1].Close
	return Result{
		PnLPct: (final/cashInit - 1) * 100,
		NBuys:  nBuys,
		NSells: nSells,
		MaxDD:  maxDD * 100,
		Final:  final,
	}
}

// ─────────────────────────────────────────────────────────
// 그리드 생성 + 워커 풀
// ─────────────────────────────────────────────────────────

func makeGrid() []Rule {
	backstops := []float64{-0.10, -0.15, -0.20, -0.25, -0.30}         // 5
	trailings := []float64{-0.03, -0.05, -0.07, -0.10}                // 4
	minProfits := []float64{0, 0.02, 0.03, 0.05, 0.08}                // 5
	// 5 × 4 × 5 = 100, BasePct는 고정 0.30 (CLAUDE.md 기본)
	var out []Rule
	id := 0
	for _, b := range backstops {
		for _, t := range trailings {
			for _, p := range minProfits {
				id++
				out = append(out, Rule{
					ID:                  id,
					BackstopPct:         b,
					TrailingPct:         t,
					SellStrongMinProfit: p,
					BasePct:             0.30,
				})
			}
		}
	}
	return out
}

type job struct {
	coin    string
	candles []Candle
	ind     Indicators
	rule    Rule
}

// ─────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────

func main() {
	dataDir := flag.String("data", "../data", "캔들 CSV 디렉터리")
	outPath := flag.String("out", "../results/05_grid_search.csv", "결과 CSV 경로")
	prefix := flag.String("prefix", "05_grid", "요약 CSV 파일명 prefix (<prefix>_top.csv 등)")
	flag.Parse()

	tStart := time.Now()

	// 1) 모든 코인 로드
	entries, err := os.ReadDir(*dataDir)
	if err != nil {
		log.Fatalf("data dir: %v", err)
	}
	var coins []loaded
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".csv") {
			continue
		}
		coin := strings.TrimSuffix(e.Name(), ".csv")
		path := filepath.Join(*dataDir, e.Name())
		cs, err := loadCandles(path)
		if err != nil {
			log.Printf("  skip %s: %v", coin, err)
			continue
		}
		if len(cs) < 100 {
			log.Printf("  skip %s: too few candles (%d)", coin, len(cs))
			continue
		}
		ind := computeIndicators(cs)
		coins = append(coins, loaded{coin, cs, ind})
		log.Printf("  loaded %s: %d candles (%s ~ %s)", coin, len(cs), cs[0].T.Format("2006-01-02"), cs[len(cs)-1].T.Format("2006-01-02"))
	}
	if len(coins) == 0 {
		log.Fatal("no data loaded")
	}

	rules := makeGrid()
	totalJobs := len(coins) * len(rules)
	log.Printf("그리드: %d 코인 × %d 룰 = %d 백테스트", len(coins), len(rules), totalJobs)

	// 2) 워커 풀로 병렬 실행
	workers := runtime.NumCPU()
	jobs := make(chan job, workers*2)
	results := make(chan Result, workers*2)

	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				r := backtest(j.candles, j.ind, j.rule)
				r.Coin = j.coin
				r.Rule = j.rule
				results <- r
			}
		}()
	}

	go func() {
		for _, c := range coins {
			for _, rule := range rules {
				jobs <- job{c.coin, c.candles, c.ind, rule}
			}
		}
		close(jobs)
	}()

	go func() {
		wg.Wait()
		close(results)
	}()

	var all []Result
	for r := range results {
		all = append(all, r)
	}

	elapsed := time.Since(tStart)
	log.Printf("완료: %d 결과, 소요 %.2fs  (%.0f backtest/s)", len(all), elapsed.Seconds(),
		float64(len(all))/elapsed.Seconds())

	// 3) CSV 저장
	if err := os.MkdirAll(filepath.Dir(*outPath), 0o755); err != nil {
		log.Fatal(err)
	}
	f, err := os.Create(*outPath)
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()
	_ = w.Write([]string{"coin", "rule_id", "backstop_pct", "trailing_pct", "min_profit", "base_pct", "pnl_pct", "max_dd_pct", "n_buys", "n_sells"})
	for _, r := range all {
		_ = w.Write([]string{
			r.Coin,
			strconv.Itoa(r.Rule.ID),
			fmt.Sprintf("%.3f", r.Rule.BackstopPct),
			fmt.Sprintf("%.3f", r.Rule.TrailingPct),
			fmt.Sprintf("%.3f", r.Rule.SellStrongMinProfit),
			fmt.Sprintf("%.2f", r.Rule.BasePct),
			fmt.Sprintf("%.3f", r.PnLPct),
			fmt.Sprintf("%.3f", r.MaxDD),
			strconv.Itoa(r.NBuys),
			strconv.Itoa(r.NSells),
		})
	}
	log.Printf("saved → %s", *outPath)

	// 3b) 요약 CSV들 생성 (UI 테이블/차트 용)
	if err := writeSummaries(all, coins, filepath.Dir(*outPath), *prefix); err != nil {
		log.Fatalf("summaries: %v", err)
	}

	// 4) 콘솔 요약
	printSummary(all, rules, coins)
}

func writeSummaries(all []Result, coins []loaded, outDir, prefix string) error {
	// 룰별 평균
	type ruleStat struct {
		rule  Rule
		sum   float64
		count int
		worst float64
		best  float64
	}
	rs := map[int]*ruleStat{}
	for _, r := range all {
		s, ok := rs[r.Rule.ID]
		if !ok {
			s = &ruleStat{rule: r.Rule, worst: r.PnLPct, best: r.PnLPct}
			rs[r.Rule.ID] = s
		}
		s.sum += r.PnLPct
		s.count++
		if r.PnLPct < s.worst {
			s.worst = r.PnLPct
		}
		if r.PnLPct > s.best {
			s.best = r.PnLPct
		}
	}
	var avgs []avgR
	for _, s := range rs {
		avgs = append(avgs, avgR{s.rule, s.sum / float64(s.count), s.worst, s.best})
	}
	sort.Slice(avgs, func(i, j int) bool { return avgs[i].avg > avgs[j].avg })

	// top rules CSV (상위 20)
	topPath := filepath.Join(outDir, prefix+"_top.csv")
	if err := writeTopRules(topPath, avgs, 20); err != nil {
		return err
	}
	log.Printf("saved → %s", topPath)

	// per-coin 최적 룰 + 홀딩 벤치마크
	perCoinPath := filepath.Join(outDir, prefix+"_per_coin.csv")
	if err := writePerCoin(perCoinPath, all, coins); err != nil {
		return err
	}
	log.Printf("saved → %s", perCoinPath)

	return nil
}

type avgR struct {
	rule  Rule
	avg   float64
	worst float64
	best  float64
}

func writeTopRules(path string, avgs []avgR, topN int) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()
	_ = w.Write([]string{"rank", "rule_id", "backstop_pct", "trailing_pct", "min_profit", "avg_pnl_pct", "worst_pnl_pct", "best_pnl_pct"})
	// 상위 topN
	for i := 0; i < topN && i < len(avgs); i++ {
		a := avgs[i]
		_ = w.Write([]string{
			strconv.Itoa(i + 1),
			strconv.Itoa(a.rule.ID),
			fmt.Sprintf("%.3f", a.rule.BackstopPct),
			fmt.Sprintf("%.3f", a.rule.TrailingPct),
			fmt.Sprintf("%.3f", a.rule.SellStrongMinProfit),
			fmt.Sprintf("%.2f", a.avg),
			fmt.Sprintf("%.2f", a.worst),
			fmt.Sprintf("%.2f", a.best),
		})
	}
	// 현재 룰 위치 추가
	for i, a := range avgs {
		if a.rule.BackstopPct == -0.15 && a.rule.TrailingPct == -0.07 && a.rule.SellStrongMinProfit == 0 {
			_ = w.Write([]string{
				fmt.Sprintf("%d", i+1),
				strconv.Itoa(a.rule.ID),
				fmt.Sprintf("%.3f (현재)", a.rule.BackstopPct),
				fmt.Sprintf("%.3f", a.rule.TrailingPct),
				fmt.Sprintf("%.3f", a.rule.SellStrongMinProfit),
				fmt.Sprintf("%.2f", a.avg),
				fmt.Sprintf("%.2f", a.worst),
				fmt.Sprintf("%.2f", a.best),
			})
			break
		}
	}
	return nil
}

func writePerCoin(path string, all []Result, coins []loaded) error {
	// 코인별 최적 룰
	bestByCoin := map[string]Result{}
	for _, r := range all {
		b, ok := bestByCoin[r.Coin]
		if !ok || r.PnLPct > b.PnLPct {
			bestByCoin[r.Coin] = r
		}
	}
	// 코인별 현재 룰 결과
	curByCoin := map[string]Result{}
	for _, r := range all {
		if r.Rule.BackstopPct == -0.15 && r.Rule.TrailingPct == -0.07 && r.Rule.SellStrongMinProfit == 0 {
			curByCoin[r.Coin] = r
		}
	}
	// 코인별 홀딩 벤치
	holdByCoin := map[string]float64{}
	for _, c := range coins {
		holdByCoin[c.coin] = holdBaselinePct(c.candles)
	}

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()
	_ = w.Write([]string{"coin", "hold_pnl_pct", "current_rule_pnl_pct", "best_rule_pnl_pct", "best_rule_id", "best_backstop", "best_trailing", "best_min_profit"})
	// 코인 이름 정렬
	var names []string
	for n := range bestByCoin {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		best := bestByCoin[n]
		cur := curByCoin[n]
		_ = w.Write([]string{
			n,
			fmt.Sprintf("%.2f", holdByCoin[n]),
			fmt.Sprintf("%.2f", cur.PnLPct),
			fmt.Sprintf("%.2f", best.PnLPct),
			strconv.Itoa(best.Rule.ID),
			fmt.Sprintf("%.3f", best.Rule.BackstopPct),
			fmt.Sprintf("%.3f", best.Rule.TrailingPct),
			fmt.Sprintf("%.3f", best.Rule.SellStrongMinProfit),
		})
	}
	return nil
}

type loaded struct {
	coin    string
	candles []Candle
	ind     Indicators
}

func printSummary(all []Result, rules []Rule, coins []loaded) {
	// 룰별 평균 PnL 집계
	ruleAgg := map[int]*struct {
		rule  Rule
		sum   float64
		count int
	}{}
	for _, r := range all {
		entry, ok := ruleAgg[r.Rule.ID]
		if !ok {
			entry = &struct {
				rule  Rule
				sum   float64
				count int
			}{rule: r.Rule}
			ruleAgg[r.Rule.ID] = entry
		}
		entry.sum += r.PnLPct
		entry.count++
	}
	type agg struct {
		rule Rule
		avg  float64
	}
	var aggs []agg
	for _, e := range ruleAgg {
		aggs = append(aggs, agg{e.rule, e.sum / float64(e.count)})
	}
	sort.Slice(aggs, func(i, j int) bool { return aggs[i].avg > aggs[j].avg })

	fmt.Println("\n=== 전 코인 평균 기준 상위 10개 룰 ===")
	fmt.Printf("%-8s %-10s %-10s %-10s %-10s  %s\n", "id", "backstop", "trail", "min_profit", "base", "avg_pnl")
	for i := 0; i < 10 && i < len(aggs); i++ {
		a := aggs[i]
		fmt.Printf("%-8d %-10.3f %-10.3f %-10.3f %-10.2f  %+6.2f%%\n",
			a.rule.ID, a.rule.BackstopPct, a.rule.TrailingPct, a.rule.SellStrongMinProfit, a.rule.BasePct, a.avg)
	}

	fmt.Println("\n=== 전 코인 평균 기준 하위 5개 ===")
	for i := len(aggs) - 5; i < len(aggs); i++ {
		if i < 0 {
			continue
		}
		a := aggs[i]
		fmt.Printf("%-8d %-10.3f %-10.3f %-10.3f %-10.2f  %+6.2f%%\n",
			a.rule.ID, a.rule.BackstopPct, a.rule.TrailingPct, a.rule.SellStrongMinProfit, a.rule.BasePct, a.avg)
	}

	// 현재 룰 위치 (backstop=-0.15, trail=-0.07, min_profit=0, base=0.30)
	for i, a := range aggs {
		if a.rule.BackstopPct == -0.15 && a.rule.TrailingPct == -0.07 && a.rule.SellStrongMinProfit == 0 {
			fmt.Printf("\n📍 현재 룰 순위: %d / %d  (avg %+.2f%%)\n", i+1, len(aggs), a.avg)
			break
		}
	}
}
