// 4시간봉 기반 체크 주기 비교.
// 신호 계산·가격 모두 4h 데이터로 — 일봉(sim 08)과 달리 단일 타임프레임.
// 테스트 주기: 4h, 8h, 12h, 24h, 48h.
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
	// RSI
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
	// MACD
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
	// BB
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

type Result struct {
	Coin   string
	Hours  int
	PnLPct float64
	NBuys  int
	NSells int
	MaxDD  float64
	Final  float64
}

// cycleHours 마다 평가. 4h 캔들 기준 → skip = cycleHours/4.
func backtest(cs []Candle, ind Indicators, cycleHours int) Result {
	skip := cycleHours / 4
	if skip < 1 {
		skip = 1
	}
	cash := cashInit
	qty := 0.0
	cost := 0.0
	peak := 0.0
	nBuys := 0
	nSells := 0
	peakEq := cashInit
	maxDD := 0.0
	var lastTrade time.Time
	minHold := time.Duration(minHoldMinutes) * time.Minute

	for i := 40; i < len(cs); i++ {
		if (i-40)%skip != 0 {
			continue
		}
		price := cs[i].Close
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
		if !lastTrade.IsZero() && cs[i].T.Sub(lastTrade) < minHold {
			continue
		}
		sig := signalAt(i, cs, ind)

		// 매도
		if qty > 0 {
			sr := 0.0
			profit := 0.0
			if avg > 0 {
				profit = price/avg - 1
			}
			switch sig {
			case sigSellStrong:
				if profit >= sellStrongMinProfit {
					sr = 1.0
				}
			case sigSell:
				if profit >= sellStrongMinProfit {
					sr = 0.5
				}
			}
			if sr == 0 && peak > 0 && price > avg*0.99 && price <= peak*(1+trailingPct) {
				sr = 1.0
			}
			if sr == 0 && avg > 0 && price <= avg*(1+backstopPct) {
				sr = 1.0
			}
			if sr > 0 {
				sold := qty * sr
				cash += sold * price * (1 - feeRate)
				cost *= (1 - sr)
				qty -= sold
				nSells++
				lastTrade = cs[i].T
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
				lastTrade = cs[i].T
			}
		}
	}
	final := cash + qty*cs[len(cs)-1].Close
	return Result{
		PnLPct: (final/cashInit - 1) * 100,
		Final:  final, NBuys: nBuys, NSells: nSells, MaxDD: maxDD * 100,
	}
}

func main() {
	dataDir := flag.String("data", "../data/minute240", "4시간 캔들 디렉터리")
	outPath := flag.String("out", "../results/09_cycle4h.csv", "결과 CSV")
	flag.Parse()

	cycles := []int{4, 8, 12, 24, 48}

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
		if err != nil {
			continue
		}
		if len(cs) < 100 {
			continue
		}
		ind := computeIndicators(cs)
		coins = append(coins, loaded{coin, cs, ind})
		log.Printf("  loaded %s: %d candles (%s ~ %s, %.1f일치)", coin, len(cs),
			cs[0].T.Format("2006-01-02"), cs[len(cs)-1].T.Format("2006-01-02"),
			cs[len(cs)-1].T.Sub(cs[0].T).Hours()/24)
	}

	type job struct {
		c    loaded
		hour int
	}
	jobs := make(chan job, runtime.NumCPU()*2)
	results := make(chan Result, runtime.NumCPU()*2)
	var wg sync.WaitGroup
	for w := 0; w < runtime.NumCPU(); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				r := backtest(j.c.cs, j.c.ind, j.hour)
				r.Coin, r.Hours = j.c.coin, j.hour
				results <- r
			}
		}()
	}
	t0 := time.Now()
	go func() {
		for _, c := range coins {
			for _, h := range cycles {
				jobs <- job{c, h}
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

	// 저장
	if err := os.MkdirAll(filepath.Dir(*outPath), 0o755); err != nil {
		log.Fatal(err)
	}
	f, _ := os.Create(*outPath)
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()
	_ = w.Write([]string{"coin", "cycle_hours", "pnl_pct", "max_dd_pct", "n_buys", "n_sells", "final_krw"})
	for _, r := range all {
		_ = w.Write([]string{r.Coin, strconv.Itoa(r.Hours),
			fmt.Sprintf("%.3f", r.PnLPct), fmt.Sprintf("%.3f", r.MaxDD),
			strconv.Itoa(r.NBuys), strconv.Itoa(r.NSells),
			fmt.Sprintf("%.0f", r.Final)})
	}
	log.Printf("saved → %s", *outPath)

	// 요약
	agg := map[int]*struct{ sum, dd float64; n, nb, ns int }{}
	for _, r := range all {
		a, ok := agg[r.Hours]
		if !ok {
			a = &struct{ sum, dd float64; n, nb, ns int }{}
			agg[r.Hours] = a
		}
		a.sum += r.PnLPct
		a.dd += r.MaxDD
		a.nb += r.NBuys
		a.ns += r.NSells
		a.n++
	}
	sumPath := strings.TrimSuffix(*outPath, ".csv") + "_summary.csv"
	sf, _ := os.Create(sumPath)
	defer sf.Close()
	sw := csv.NewWriter(sf)
	defer sw.Flush()
	_ = sw.Write([]string{"cycle_hours", "avg_pnl_pct", "avg_max_dd_pct", "total_buys", "total_sells"})
	sort.Ints(cycles)
	fmt.Printf("\n%-8s %-12s %-12s %-10s %-10s\n", "cycle", "avg_pnl", "avg_dd", "buys", "sells")
	fmt.Println("-------------------------------------------------")
	for _, h := range cycles {
		a := agg[h]
		avgP := a.sum / float64(a.n)
		avgD := a.dd / float64(a.n)
		_ = sw.Write([]string{strconv.Itoa(h),
			fmt.Sprintf("%.2f", avgP), fmt.Sprintf("%.2f", avgD),
			strconv.Itoa(a.nb), strconv.Itoa(a.ns)})
		fmt.Printf("%-5dh  %+10.2f%%  %+10.2f%%  %-10d %-10d\n", h, avgP, avgD, a.nb, a.ns)
	}
	log.Printf("saved → %s", sumPath)
}
