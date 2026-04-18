// 체크 주기 비교 시뮬레이션.
// 일봉으로 신호 계산 + 15분봉 가격으로 체결 + 체크 주기는 파라미터.
//
// 목적: 일봉 기반 알고리즘에서 매매 사이클을 얼마나 자주 돌려야 하는가?
// 가설: 잦을수록 트레일링 손절 반응은 빠르지만 매수·매도가는 달라짐.
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

const (
	feeRate     = 0.0005
	rsiPeriod   = 14
	macdFast    = 12
	macdSlow    = 26
	macdSignal  = 9
	bbPeriod    = 20
	bbStdMul    = 2.0
	volMAPeriod = 20
	minTradeKRW = 5000.0
	cashInit    = 10_000_000.0

	// v5 룰 (config.json과 동기)
	backstopPct         = -0.25
	trailingPct         = -0.10
	sellStrongMinProfit = 0.03
	basePct             = 0.30
	minHoldMinutes      = 1440 // v5: 24시간 최소 홀딩
)

type Candle struct {
	T                      time.Time
	Open, High, Low, Close float64
	Volume                 float64
}

type Indicators struct {
	RSI                    []float64
	Hist, PrevHist         []float64
	BBU, BBL               []float64
	MA5, MA20              []float64
	VR                     []float64
}

// 15분 CSV 로드
func loadCandles(path string) ([]Candle, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	r := csv.NewReader(f)
	header, _ := r.Read()
	col := map[string]int{}
	for i, h := range header {
		col[h] = i
	}
	var out []Candle
	for {
		row, err := r.Read()
		if err != nil {
			break
		}
		t, err := time.Parse("2006-01-02 15:04:05", strings.TrimSpace(row[col["t"]]))
		if err != nil {
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

// 15분봉 → 일봉 (KST 기준, 00:00 경계)
func resampleDaily(cs []Candle) []Candle {
	if len(cs) == 0 {
		return nil
	}
	kst := time.FixedZone("KST", 9*3600)
	type agg struct {
		c     Candle
		first bool
	}
	order := []string{}
	days := map[string]*Candle{}
	for _, c := range cs {
		d := c.T.In(kst)
		ymd := d.Format("2006-01-02")
		day, ok := days[ymd]
		if !ok {
			t, _ := time.ParseInLocation("2006-01-02", ymd, kst)
			day = &Candle{T: t, Open: c.Open, High: c.High, Low: c.Low, Close: c.Close, Volume: c.Volume}
			days[ymd] = day
			order = append(order, ymd)
		} else {
			if c.High > day.High {
				day.High = c.High
			}
			if c.Low < day.Low {
				day.Low = c.Low
			}
			day.Close = c.Close // 15m 정렬되어 있다고 가정 → 마지막이 close
			day.Volume += c.Volume
		}
	}
	sort.Strings(order)
	out := make([]Candle, 0, len(order))
	for _, k := range order {
		out = append(out, *days[k])
	}
	return out
}

// EMA
func ema(x []float64, span int) []float64 {
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
	var s float64
	for i := 0; i < period; i++ {
		s += x[i]
	}
	out[period-1] = s / float64(period)
	for i := period; i < len(x); i++ {
		s += x[i] - x[i-period]
		out[i] = s / float64(period)
	}
	return out
}

func computeIndicators(cs []Candle) Indicators {
	n := len(cs)
	close := make([]float64, n)
	vol := make([]float64, n)
	for i, c := range cs {
		close[i] = c.Close
		vol[i] = c.Volume
	}
	ind := Indicators{
		RSI: make([]float64, n), Hist: make([]float64, n), PrevHist: make([]float64, n),
		BBU: make([]float64, n), BBL: make([]float64, n),
		MA5: make([]float64, n), MA20: make([]float64, n), VR: make([]float64, n),
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

	// RSI
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
	// MACD
	emaF := ema(close, macdFast)
	emaS := ema(close, macdSlow)
	macdLine := make([]float64, n)
	for i := range macdLine {
		macdLine[i] = emaF[i] - emaS[i]
	}
	sig := ema(macdLine, macdSignal)
	for i := range ind.Hist {
		ind.Hist[i] = macdLine[i] - sig[i]
	}
	for i := 1; i < n; i++ {
		ind.PrevHist[i] = ind.Hist[i-1]
	}
	// BB
	var rollVals []float64
	var rollSum float64
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
			std := math.Sqrt(sq / float64(bbPeriod-1))
			ind.BBU[i] = mean + bbStdMul*std
			ind.BBL[i] = mean - bbStdMul*std
		}
	}
	ind.MA5 = rollingMean(close, 5)
	ind.MA20 = rollingMean(close, 20)
	volMA := rollingMean(vol, volMAPeriod)
	for i := range ind.VR {
		if !math.IsNaN(volMA[i]) && volMA[i] > 0 {
			ind.VR[i] = vol[i] / volMA[i]
		}
	}
	return ind
}

type signal int

const (
	sigHold signal = iota
	sigBuyStrong
	sigBuy
	sigSellStrong
	sigSell
)

func signalAtDaily(j int, dCs []Candle, dInd Indicators) signal {
	if j < 40 || j >= len(dCs) {
		return sigHold
	}
	rsi, hist, prev := dInd.RSI[j], dInd.Hist[j], dInd.PrevHist[j]
	bbu, bbl := dInd.BBU[j], dInd.BBL[j]
	ma5, ma20, price := dInd.MA5[j], dInd.MA20[j], dCs[j].Close
	vr := dInd.VR[j]
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

// 각 15m 인덱스에 대해, 그 시점에서 "마지막으로 닫힌" 일봉 인덱스를 반환.
// 간단 기준: daily[j].T < cs15[i].T 인 최대 j.
func buildDailyIdxLookup(cs15 []Candle, daily []Candle) []int {
	out := make([]int, len(cs15))
	j := -1
	dk := 0
	for i, c := range cs15 {
		for dk < len(daily) && !daily[dk].T.After(c.T) {
			j = dk
			dk++
		}
		out[i] = j
	}
	return out
}

type Result struct {
	Coin        string
	FreqMinutes int
	PnLPct      float64
	Final       float64
	NBuys       int
	NSells      int
	MaxDD       float64
}

func backtest(cs15 []Candle, daily []Candle, dInd Indicators, dIdx []int, freqMin int) Result {
	bars := freqMin / 15
	if bars < 1 {
		bars = 1
	}
	cash := cashInit
	qty := 0.0
	cost := 0.0
	peak := 0.0
	nBuys := 0
	nSells := 0
	peakEq := cashInit
	maxDD := 0.0
	var lastTradeTime time.Time
	minHold := time.Duration(minHoldMinutes) * time.Minute

	for i, c := range cs15 {
		if i%bars != 0 {
			continue
		}
		if dIdx[i] < 40 {
			continue
		}
		// min_hold: 직전 거래 후 24h 안 지났으면 스킵 (트레일링/백스톱 포함)
		inHold := !lastTradeTime.IsZero() && c.T.Sub(lastTradeTime) < minHold
		price := c.Close
		equity := cash + qty*price
		if equity > peakEq {
			peakEq = equity
		}
		dd := (equity - peakEq) / peakEq
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

		sig := signalAtDaily(dIdx[i], daily, dInd)

		if inHold {
			continue
		}

		// 매도
		if qty > 0 {
			sellRatio := 0.0
			profit := 0.0
			if avg > 0 {
				profit = price/avg - 1
			}
			switch sig {
			case sigSellStrong:
				if profit >= sellStrongMinProfit {
					sellRatio = 1.0
				}
			case sigSell:
				if profit >= sellStrongMinProfit {
					sellRatio = 0.5
				}
			}
			if sellRatio == 0 && peak > 0 && price > avg*0.99 && price <= peak*(1+trailingPct) {
				sellRatio = 1.0
			}
			if sellRatio == 0 && avg > 0 && price <= avg*(1+backstopPct) {
				sellRatio = 1.0
			}
			if sellRatio > 0 {
				sold := qty * sellRatio
				cash += sold * price * (1 - feeRate)
				cost *= (1 - sellRatio)
				qty -= sold
				nSells++
				lastTradeTime = c.T
				if qty == 0 {
					peak = 0
				}
			}
		}

		// 매수
		if sig == sigBuyStrong || sig == sigBuy {
			pct := basePct
			if sig == sigBuy {
				pct = 0.10
			}
			target := equity * pct
			amt := target
			if amt > cash {
				amt = cash
			}
			limit := equity*0.50 - qty*price
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
				lastTradeTime = c.T
			}
		}
	}

	final := cash + qty*cs15[len(cs15)-1].Close
	return Result{
		PnLPct: (final/cashInit - 1) * 100,
		Final:  final, NBuys: nBuys, NSells: nSells,
		MaxDD: maxDD * 100,
	}
}

func main() {
	dataDir := flag.String("data", "../data/minute15", "15분 캔들 CSV 디렉터리")
	outPath := flag.String("out", "../results/08_cycle_freq.csv", "결과 CSV")
	flag.Parse()

	freqs := []int{15, 30, 60, 120, 240, 480, 720, 1440}

	entries, err := os.ReadDir(*dataDir)
	if err != nil {
		log.Fatal(err)
	}
	type loaded struct {
		coin   string
		cs15   []Candle
		daily  []Candle
		dInd   Indicators
		dIdx   []int
	}
	var coins []loaded
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".csv") {
			continue
		}
		coin := strings.TrimSuffix(e.Name(), ".csv")
		cs15, err := loadCandles(filepath.Join(*dataDir, e.Name()))
		if err != nil {
			log.Printf("skip %s: %v", coin, err)
			continue
		}
		daily := resampleDaily(cs15)
		if len(daily) < 50 {
			log.Printf("skip %s: daily too short (%d)", coin, len(daily))
			continue
		}
		dInd := computeIndicators(daily)
		dIdx := buildDailyIdxLookup(cs15, daily)
		coins = append(coins, loaded{coin, cs15, daily, dInd, dIdx})
		log.Printf("  loaded %s: 15m=%d, daily=%d", coin, len(cs15), len(daily))
	}

	type job struct {
		c    loaded
		freq int
	}
	jobs := make(chan job, runtime.NumCPU()*2)
	results := make(chan Result, runtime.NumCPU()*2)
	var wg sync.WaitGroup
	for w := 0; w < runtime.NumCPU(); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				r := backtest(j.c.cs15, j.c.daily, j.c.dInd, j.c.dIdx, j.freq)
				r.Coin = j.c.coin
				r.FreqMinutes = j.freq
				results <- r
			}
		}()
	}
	t0 := time.Now()
	go func() {
		for _, c := range coins {
			for _, f := range freqs {
				jobs <- job{c, f}
			}
		}
		close(jobs)
	}()
	go func() { wg.Wait(); close(results) }()

	var all []Result
	for r := range results {
		all = append(all, r)
	}
	log.Printf("완료: %d 결과, %.2fs", len(all), time.Since(t0).Seconds())

	// CSV 저장
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
	_ = w.Write([]string{"coin", "freq_minutes", "pnl_pct", "max_dd_pct", "n_buys", "n_sells", "final_krw"})
	for _, r := range all {
		_ = w.Write([]string{r.Coin, strconv.Itoa(r.FreqMinutes),
			fmt.Sprintf("%.3f", r.PnLPct),
			fmt.Sprintf("%.3f", r.MaxDD),
			strconv.Itoa(r.NBuys), strconv.Itoa(r.NSells),
			fmt.Sprintf("%.0f", r.Final)})
	}
	log.Printf("saved → %s", *outPath)

	// 주기별 요약
	agg := map[int]*struct{ sum, maxdd float64; n, nbuys, nsells int }{}
	for _, r := range all {
		a, ok := agg[r.FreqMinutes]
		if !ok {
			a = &struct{ sum, maxdd float64; n, nbuys, nsells int }{}
			agg[r.FreqMinutes] = a
		}
		a.sum += r.PnLPct
		a.maxdd += r.MaxDD
		a.nbuys += r.NBuys
		a.nsells += r.NSells
		a.n++
	}
	// 요약 CSV
	sumPath := strings.TrimSuffix(*outPath, ".csv") + "_summary.csv"
	sf, _ := os.Create(sumPath)
	defer sf.Close()
	sw := csv.NewWriter(sf)
	defer sw.Flush()
	_ = sw.Write([]string{"freq_minutes", "avg_pnl_pct", "avg_max_dd_pct", "total_buys", "total_sells"})
	fmt.Printf("\n%-6s %-10s %-10s %-10s %-10s\n", "freq", "avg_pnl", "avg_dd", "buys", "sells")
	fmt.Println("-----------------------------------------------")
	for _, fr := range freqs {
		a := agg[fr]
		avgPnl := a.sum / float64(a.n)
		avgDD := a.maxdd / float64(a.n)
		_ = sw.Write([]string{strconv.Itoa(fr),
			fmt.Sprintf("%.2f", avgPnl),
			fmt.Sprintf("%.2f", avgDD),
			strconv.Itoa(a.nbuys),
			strconv.Itoa(a.nsells)})
		fmt.Printf("%-6dm %+9.2f%% %+9.2f%% %-10d %-10d\n", fr, avgPnl, avgDD, a.nbuys, a.nsells)
	}
	log.Printf("saved → %s", sumPath)
}
