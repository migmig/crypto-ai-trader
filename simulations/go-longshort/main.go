// Long-only / Short-only / Long+Short 비교 백테스트.
// 신호·가격 모두 일봉 기준. 최대 가용 데이터로 (코인별 길이 다를 수 있음).
//
// Short 규칙 (long 대칭):
//   OPEN SHORT: sell_strong/sell 신호 + 포지션 없음
//   CLOSE SHORT: buy_strong/buy 신호 (익절 +min_profit 이상일 때) / 상향 trailing / 상향 backstop
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
	feeRate             = 0.0005
	rsiPeriod           = 14
	macdFast            = 12
	macdSlow            = 26
	macdSignal          = 9
	bbPeriod            = 20
	bbStdMul            = 2.0
	volMAPeriod         = 20
	minTradeKRW         = 5000.0
	cashInit            = 10_000_000.0
	backstopPct         = -0.25
	trailingPct         = -0.10
	sellStrongMinProfit = 0.03
	basePct             = 0.30
	minHoldMinutes      = 1440
	borrowRatePerDay    = 0.0002 // 0.02%/일 (공매도 차입 비용 가정)
)

type Candle struct {
	T                      time.Time
	Open, High, Low, Close float64
	Volume                 float64
}
type Indicators struct {
	RSI, Hist, PrevHist []float64
	BBU, BBL            []float64
	MA5, MA20           []float64
	VR                  []float64
}

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
		parse := func(s string) float64 { v, _ := strconv.ParseFloat(strings.TrimSpace(s), 64); return v }
		out = append(out, Candle{T: t, Open: parse(row[col["open"]]), High: parse(row[col["high"]]),
			Low: parse(row[col["low"]]), Close: parse(row[col["close"]]), Volume: parse(row[col["volume"]])})
	}
	return out, nil
}

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

func rollingMean(x []float64, p int) []float64 {
	out := make([]float64, len(x))
	for i := range out {
		out[i] = math.NaN()
	}
	if len(x) < p {
		return out
	}
	var s float64
	for i := 0; i < p; i++ {
		s += x[i]
	}
	out[p-1] = s / float64(p)
	for i := p; i < len(x); i++ {
		s += x[i] - x[i-p]
		out[i] = s / float64(p)
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
		ind.RSI[i], ind.Hist[i], ind.PrevHist[i] = math.NaN(), math.NaN(), math.NaN()
		ind.BBU[i], ind.BBL[i] = math.NaN(), math.NaN()
		ind.MA5[i], ind.MA20[i], ind.VR[i] = math.NaN(), math.NaN(), math.NaN()
	}
	gains, losses := make([]float64, n), make([]float64, n)
	for i := 1; i < n; i++ {
		d := close[i] - close[i-1]
		if d > 0 {
			gains[i] = d
		} else {
			losses[i] = -d
		}
	}
	var g, l float64
	for i := 0; i < n; i++ {
		g += gains[i]
		l += losses[i]
		if i >= rsiPeriod {
			g -= gains[i-rsiPeriod]
			l -= losses[i-rsiPeriod]
			avgG := g / rsiPeriod
			avgL := l / rsiPeriod
			if avgL == 0 {
				ind.RSI[i] = 100
			} else {
				rs := avgG / avgL
				ind.RSI[i] = 100 - 100/(1+rs)
			}
		}
	}
	emaF := ema(close, macdFast)
	emaS := ema(close, macdSlow)
	macd := make([]float64, n)
	for i := range macd {
		macd[i] = emaF[i] - emaS[i]
	}
	sig := ema(macd, macdSignal)
	for i := range ind.Hist {
		ind.Hist[i] = macd[i] - sig[i]
	}
	for i := 1; i < n; i++ {
		ind.PrevHist[i] = ind.Hist[i-1]
	}
	var roll []float64
	var rs float64
	for i := 0; i < n; i++ {
		roll = append(roll, close[i])
		rs += close[i]
		if len(roll) > bbPeriod {
			rs -= roll[0]
			roll = roll[1:]
		}
		if len(roll) == bbPeriod {
			mean := rs / float64(bbPeriod)
			var sq float64
			for _, v := range roll {
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

func signalAt(i int, cs []Candle, ind Indicators) signal {
	rsi, hist, prev := ind.RSI[i], ind.Hist[i], ind.PrevHist[i]
	bbu, bbl := ind.BBU[i], ind.BBL[i]
	ma5, ma20, price := ind.MA5[i], ind.MA20[i], cs[i].Close
	vr := ind.VR[i]
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

type Mode int

const (
	LongOnly Mode = iota
	ShortOnly
	LongShort
)

type Result struct {
	Coin    string
	Mode    string
	PnLPct  float64
	NLongs  int
	NShorts int
	MaxDD   float64
	Final   float64
	HoldPct float64
	Days    float64
}

func backtest(cs []Candle, ind Indicators, mode Mode, startIdx int) Result {
	n := len(cs)
	if startIdx < 40 {
		startIdx = 40
	}
	cash := cashInit
	// 롱 포지션
	longQty := 0.0
	longCost := 0.0
	longPeak := 0.0
	// 숏 포지션 (단순화: qty는 "빌려서 팔은 BTC 수량", cost는 숏 오픈 시 받은 현금)
	shortQty := 0.0
	shortEntry := 0.0
	shortValley := 0.0 // 숏 오픈 후 최저가 (trailing 기준)
	shortOpenTime := time.Time{}
	var lastTrade time.Time
	nLongs, nShorts := 0, 0
	peakEq := cashInit
	maxDD := 0.0
	minHold := time.Duration(minHoldMinutes) * time.Minute

	valueAt := func(price float64) float64 {
		// 현금 + 롱 가치 + 숏 미실현
		longVal := longQty * price
		shortVal := 0.0
		if shortQty > 0 {
			// 숏 가치 = (entry - current) * qty
			shortVal = (shortEntry - price) * shortQty
		}
		return cash + longVal + shortVal
	}

	for i := startIdx; i < n; i++ {
		price := cs[i].Close
		// 차입 비용 누적 (숏 보유 중)
		if shortQty > 0 && !shortOpenTime.IsZero() {
			daysHeld := cs[i].T.Sub(cs[i-1].T).Hours() / 24
			borrowFee := shortQty * price * borrowRatePerDay * daysHeld
			cash -= borrowFee
		}
		equity := valueAt(price)
		if equity > peakEq {
			peakEq = equity
		}
		dd := (equity - peakEq) / peakEq
		if dd < maxDD {
			maxDD = dd
		}
		// 트래킹
		longAvg := 0.0
		if longQty > 0 {
			longAvg = longCost / longQty
			if price > longAvg && price > longPeak {
				longPeak = price
			}
		}
		if shortQty > 0 && price < shortValley {
			shortValley = price
		}
		if !lastTrade.IsZero() && cs[i].T.Sub(lastTrade) < minHold {
			continue
		}

		sig := signalAt(i, cs, ind)

		// ═══ 롱 관리 (mode != ShortOnly) ═══
		if mode != ShortOnly && longQty > 0 {
			sellRatio := 0.0
			profit := (price / longAvg) - 1
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
			if sellRatio == 0 && longPeak > 0 && price > longAvg*0.99 && price <= longPeak*(1+trailingPct) {
				sellRatio = 1.0
			}
			if sellRatio == 0 && price <= longAvg*(1+backstopPct) {
				sellRatio = 1.0
			}
			if sellRatio > 0 {
				sold := longQty * sellRatio
				cash += sold * price * (1 - feeRate)
				longCost *= (1 - sellRatio)
				longQty -= sold
				lastTrade = cs[i].T
				if longQty == 0 {
					longPeak = 0
				}
			}
		}

		// ═══ 숏 관리 (mode != LongOnly) ═══
		if mode != LongOnly && shortQty > 0 {
			coverRatio := 0.0
			profitPct := (shortEntry - price) / shortEntry // 양수 = 수익
			switch sig {
			case sigBuyStrong:
				if profitPct >= sellStrongMinProfit {
					coverRatio = 1.0
				}
			case sigBuy:
				if profitPct >= sellStrongMinProfit {
					coverRatio = 0.5
				}
			}
			// 상향 trailing (저점 대비 +trailing% 반등 시 커버)
			if coverRatio == 0 && shortValley > 0 && price < shortEntry*1.01 && price >= shortValley*(1-trailingPct) {
				coverRatio = 1.0
			}
			// 상향 backstop (엔트리 대비 -backstop% 상승 시 손절)
			if coverRatio == 0 && price >= shortEntry*(1-backstopPct) {
				coverRatio = 1.0
			}
			if coverRatio > 0 {
				covered := shortQty * coverRatio
				// 커버: 가격 × qty 만큼 갚고 수수료
				cash -= covered * price * (1 + feeRate)
				// 원래 숏 오픈 시 받은 현금은 이미 cash에 있음
				shortQty -= covered
				lastTrade = cs[i].T
				if shortQty == 0 {
					shortValley = 0
					shortEntry = 0
					shortOpenTime = time.Time{}
				}
			}
		}

		// ═══ 포지션 오픈 ═══
		hasPos := longQty > 0 || shortQty > 0
		if !hasPos {
			if mode != ShortOnly && (sig == sigBuyStrong || sig == sigBuy) {
				pct := basePct
				if sig == sigBuy {
					pct = 0.10
				}
				amt := equity * pct
				if amt > cash {
					amt = cash
				}
				if amt >= minTradeKRW {
					longQty = amt / price * (1 - feeRate)
					longCost = amt
					cash -= amt
					nLongs++
					lastTrade = cs[i].T
				}
			} else if mode != LongOnly && (sig == sigSellStrong || sig == sigSell) {
				pct := basePct
				if sig == sigSell {
					pct = 0.10
				}
				notional := equity * pct
				if notional >= minTradeKRW {
					// 숏 오픈: qty = notional/price (차입). cash += 판매 대금 (수수료 차감)
					shortQty = notional / price
					shortEntry = price
					shortValley = price
					shortOpenTime = cs[i].T
					cash += notional * (1 - feeRate)
					nShorts++
					lastTrade = cs[i].T
				}
			}
		}
	}

	// 청산 (최종 평가)
	finalPrice := cs[n-1].Close
	if longQty > 0 {
		cash += longQty * finalPrice * (1 - feeRate)
		longQty = 0
	}
	if shortQty > 0 {
		cash -= shortQty * finalPrice * (1 + feeRate)
		shortQty = 0
	}

	days := cs[n-1].T.Sub(cs[startIdx].T).Hours() / 24
	holdPct := ((finalPrice * (1 - feeRate)) / (cs[startIdx].Close / (1 - feeRate)) - 1) * 100

	modeName := "long"
	if mode == ShortOnly {
		modeName = "short"
	} else if mode == LongShort {
		modeName = "long_short"
	}
	return Result{
		Mode: modeName, PnLPct: (cash/cashInit - 1) * 100,
		NLongs: nLongs, NShorts: nShorts,
		MaxDD: maxDD * 100, Final: cash, HoldPct: holdPct, Days: days,
	}
}

func main() {
	dataDir := flag.String("data", "../data/day", "일봉 캔들 디렉터리")
	outPath := flag.String("out", "../results/10_longshort.csv", "결과 CSV")
	lastDays := flag.Int("last", 0, "마지막 N일만 백테스트 (0=전체)")
	flag.Parse()

	entries, err := os.ReadDir(*dataDir)
	if err != nil {
		log.Fatal(err)
	}
	type loaded struct {
		coin string
		cs   []Candle
		ind  Indicators
	}
	var coins []loaded
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".csv") {
			continue
		}
		coin := strings.TrimSuffix(e.Name(), ".csv")
		cs, err := loadCandles(filepath.Join(*dataDir, e.Name()))
		if err != nil || len(cs) < 100 {
			continue
		}
		ind := computeIndicators(cs)
		coins = append(coins, loaded{coin, cs, ind})
		days := cs[len(cs)-1].T.Sub(cs[0].T).Hours() / 24
		log.Printf("  loaded %s: %d candles (%s ~ %s, %.1f일)", coin, len(cs),
			cs[0].T.Format("2006-01-02"), cs[len(cs)-1].T.Format("2006-01-02"), days)
	}
	modes := []Mode{LongOnly, ShortOnly, LongShort}

	type job struct {
		c loaded
		m Mode
	}
	jobs := make(chan job, runtime.NumCPU()*2)
	results := make(chan Result, runtime.NumCPU()*2)
	var wg sync.WaitGroup
	for w := 0; w < runtime.NumCPU(); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				startIdx := 40
				if *lastDays > 0 && len(j.c.cs) > *lastDays {
					startIdx = len(j.c.cs) - *lastDays
					if startIdx < 40 {
						startIdx = 40
					}
				}
				r := backtest(j.c.cs, j.c.ind, j.m, startIdx)
				r.Coin = j.c.coin
				results <- r
			}
		}()
	}
	t0 := time.Now()
	go func() {
		for _, c := range coins {
			for _, m := range modes {
				jobs <- job{c, m}
			}
		}
		close(jobs)
	}()
	go func() { wg.Wait(); close(results) }()
	var all []Result
	for r := range results {
		all = append(all, r)
	}
	log.Printf("완료: %d 결과, %.3fs", len(all), time.Since(t0).Seconds())

	// CSV 저장
	_ = os.MkdirAll(filepath.Dir(*outPath), 0o755)
	f, _ := os.Create(*outPath)
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()
	_ = w.Write([]string{"coin", "mode", "days", "hold_pnl_pct", "pnl_pct", "max_dd_pct", "n_longs", "n_shorts", "final_krw"})
	sort.Slice(all, func(i, j int) bool {
		if all[i].Coin != all[j].Coin {
			return all[i].Coin < all[j].Coin
		}
		return all[i].Mode < all[j].Mode
	})
	for _, r := range all {
		_ = w.Write([]string{r.Coin, r.Mode,
			fmt.Sprintf("%.0f", r.Days),
			fmt.Sprintf("%.2f", r.HoldPct),
			fmt.Sprintf("%.2f", r.PnLPct),
			fmt.Sprintf("%.2f", r.MaxDD),
			strconv.Itoa(r.NLongs), strconv.Itoa(r.NShorts),
			fmt.Sprintf("%.0f", r.Final)})
	}
	log.Printf("saved → %s", *outPath)

	// 모드별 평균 요약
	agg := map[string]*struct{ sum, dd float64; n int }{}
	for _, r := range all {
		a, ok := agg[r.Mode]
		if !ok {
			a = &struct{ sum, dd float64; n int }{}
			agg[r.Mode] = a
		}
		a.sum += r.PnLPct
		a.dd += r.MaxDD
		a.n++
	}
	sumPath := strings.TrimSuffix(*outPath, ".csv") + "_summary.csv"
	sf, _ := os.Create(sumPath)
	defer sf.Close()
	sw := csv.NewWriter(sf)
	defer sw.Flush()
	_ = sw.Write([]string{"mode", "avg_pnl_pct", "avg_max_dd_pct", "n_coins"})
	fmt.Printf("\n%-12s %-12s %-12s\n", "mode", "avg_pnl", "avg_dd")
	fmt.Println("-------------------------------------")
	for _, m := range []string{"long", "short", "long_short"} {
		a := agg[m]
		avgP := a.sum / float64(a.n)
		avgD := a.dd / float64(a.n)
		_ = sw.Write([]string{m, fmt.Sprintf("%.2f", avgP), fmt.Sprintf("%.2f", avgD), strconv.Itoa(a.n)})
		fmt.Printf("%-12s %+10.2f%%  %+10.2f%%\n", m, avgP, avgD)
	}
	log.Printf("saved → %s", sumPath)
}
