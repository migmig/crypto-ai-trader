// Playground HTTP 서버 — 캔들·지표를 메모리에 로드해두고 파라미터로 백테스트 수행.
// Flask가 proxy. 포트 5051.
package main

import (
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
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

type DataSet struct {
	Candles []Candle
	Ind     Indicators
}

// 전역 캐시
var (
	allData   = map[string]map[string]*DataSet{} // interval → coin → dataset
	dataMu    sync.RWMutex
	intervals = []string{"minute15", "minute30", "minute60", "minute240", "day"}
)

// 인터벌별 분 단위 (시간 계산용)
var intervalMinutes = map[string]int{
	"minute15":  15,
	"minute30":  30,
	"minute60":  60,
	"minute240": 240,
	"day":       1440,
}

// ─────────────────────────────────────────────────────
// CSV 로드 + 지표 계산
// ─────────────────────────────────────────────────────

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

// 전체 데이터 로드 (startup에서 1회)
func loadAll(dataRoot string) {
	dataMu.Lock()
	defer dataMu.Unlock()
	for _, iv := range intervals {
		dir := filepath.Join(dataRoot, iv)
		entries, err := os.ReadDir(dir)
		if err != nil {
			log.Printf("skip %s: %v", iv, err)
			continue
		}
		intervalMap := map[string]*DataSet{}
		for _, e := range entries {
			if !strings.HasSuffix(e.Name(), ".csv") {
				continue
			}
			coin := strings.TrimSuffix(e.Name(), ".csv")
			cs, err := loadCandles(filepath.Join(dir, e.Name()))
			if err != nil || len(cs) < 50 {
				continue
			}
			intervalMap[coin] = &DataSet{Candles: cs, Ind: computeIndicators(cs)}
		}
		allData[iv] = intervalMap
		log.Printf("loaded interval=%s coins=%d", iv, len(intervalMap))
	}
}

// ─────────────────────────────────────────────────────
// 신호 + 백테스트 (playground 파라미터 기반)
// ─────────────────────────────────────────────────────

type Rule struct {
	BackstopPct         float64 `json:"backstop_pct"`
	TrailingPct         float64 `json:"trailing_pct"`
	SellStrongMinProfit float64 `json:"sell_strong_min_profit"`
	BasePct             float64 `json:"base_pct"`
	MinHoldMinutes      int     `json:"min_hold_minutes"`
}

type BacktestRequest struct {
	Interval   string   `json:"interval"`
	Coins      []string `json:"coins"` // empty = all
	LastDays   int      `json:"last_days"`
	CycleHours float64  `json:"cycle_hours"`
	CashInit   float64  `json:"cash_init"`
	Rule       Rule     `json:"rule"`
	Reverse    bool     `json:"reverse"` // true → 매수↔매도 신호 반전
}

type EquityPoint struct {
	T string  `json:"t"`
	V float64 `json:"v"`
	P float64 `json:"p"` // 해당 시점 종가 (가격 차트 overlay용)
}

type TradeEvent struct {
	T      string  `json:"t"`
	Action string  `json:"action"`
	Price  float64 `json:"price"`
	Qty    float64 `json:"qty"`
	Reason string  `json:"reason"`
}

type CoinResult struct {
	Coin       string        `json:"coin"`
	PnLPct     float64       `json:"pnl_pct"`
	MaxDD      float64       `json:"max_dd_pct"`
	NBuys      int           `json:"n_buys"`
	NSells     int           `json:"n_sells"`
	Final      float64       `json:"final_krw"`
	HoldPct    float64       `json:"hold_pnl_pct"`
	HoldCurve  []EquityPoint `json:"hold_curve"`
	DCAPct     float64       `json:"dca_pnl_pct"`
	DCACurve   []EquityPoint `json:"dca_curve"`
	DCAInvested float64      `json:"dca_invested"`
	Equity     []EquityPoint `json:"equity_curve"`
	Trades     []TradeEvent  `json:"trades"`
}

type BacktestResponse struct {
	Interval    string       `json:"interval"`
	CycleHours  float64      `json:"cycle_hours"`
	Rule        Rule         `json:"rule"`
	PerCoin     []CoinResult `json:"per_coin"`
	AvgPnL      float64      `json:"avg_pnl_pct"`
	AvgMaxDD    float64      `json:"avg_max_dd_pct"`
	TotalBuys   int          `json:"total_buys"`
	TotalSells  int          `json:"total_sells"`
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

// DCA 금액 (원)
const dcaAmountKRW = 10_000

func reverseSignal(s signal) signal {
	switch s {
	case sigBuyStrong:
		return sigSellStrong
	case sigBuy:
		return sigSell
	case sigSellStrong:
		return sigBuyStrong
	case sigSell:
		return sigBuy
	}
	return sigHold
}

func backtestOne(ds *DataSet, rule Rule, skip, startIdx int, cashInit float64, maxTrades int, reverse bool) CoinResult {
	cs, ind := ds.Candles, ds.Ind
	if startIdx < 40 {
		startIdx = 40
	}
	cash := cashInit
	qty, cost, peak := 0.0, 0.0, 0.0
	nBuys, nSells := 0, 0
	peakEq := cashInit
	maxDD := 0.0
	var lastTrade time.Time
	minHold := time.Duration(rule.MinHoldMinutes) * time.Minute

	// ─── Buy&Hold 기준선: 시작점에 cashInit 전액 매수 ───
	holdEntryPrice := cs[startIdx].Close
	holdQty := cashInit / holdEntryPrice * (1 - feeRate)

	// ─── DCA 기준선: 하루 1회 ₩10k 매수 ───
	ivMinutes := 1 // 기본 (day 기준)
	if ds != nil && len(cs) > 1 {
		diff := cs[1].T.Sub(cs[0].T).Minutes()
		if diff > 0 {
			ivMinutes = int(diff)
		}
	}
	dcaStep := 1440 / ivMinutes // 하루 간격으로 매수할 candle 수
	if dcaStep < 1 {
		dcaStep = 1
	}
	var dcaCash = cashInit // DCA 전용 가상 지갑 (cashInit 안에서 ₩10k씩 투입)
	var dcaQty, dcaInvested float64

	// equity curve 저장 (200점으로 다운샘플)
	totalPts := len(cs) - startIdx
	stride := 1
	if totalPts > 200 {
		stride = totalPts / 200
	}
	var eq, holdCurve, dcaCurve []EquityPoint
	var trades []TradeEvent

	for i := startIdx; i < len(cs); i++ {
		price := cs[i].Close

		// ─── DCA: 매 dcaStep candle마다 ₩10k 매수 ───
		if (i-startIdx)%dcaStep == 0 && dcaCash >= dcaAmountKRW {
			dcaQty += dcaAmountKRW / price * (1 - feeRate)
			dcaCash -= dcaAmountKRW
			dcaInvested += dcaAmountKRW
		}

		// 샘플링 포인트엔 세 기준 모두 equity 기록
		isSample := (i-startIdx)%stride == 0
		if isSample {
			holdVal := holdQty * price
			holdCurve = append(holdCurve, EquityPoint{T: cs[i].T.Format("2006-01-02T15:04:05"), V: holdVal, P: price})
			// DCA 정규화: 코인 가치 ÷ 투자원금 × cashInit
			// → DCA가 ₩10M을 한번에 평단가로 매수한 것처럼 환산 (Hold와 비교 가능)
			dcaNorm := cashInit
			if dcaInvested > 0 {
				dcaNorm = (dcaQty * price / dcaInvested) * cashInit
			}
			dcaCurve = append(dcaCurve, EquityPoint{T: cs[i].T.Format("2006-01-02T15:04:05"), V: dcaNorm, P: price})
		}

		// 룰 백테스트는 cycle skip 주기로만 평가
		if (i-startIdx)%skip != 0 {
			continue
		}
		equity := cash + qty*price
		if equity > peakEq {
			peakEq = equity
		}
		dd := (equity - peakEq) / peakEq
		if dd < maxDD {
			maxDD = dd
		}
		if isSample {
			eq = append(eq, EquityPoint{T: cs[i].T.Format("2006-01-02T15:04:05"), V: equity, P: price})
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
		if reverse {
			sig = reverseSignal(sig)
		}

		// 매도
		if qty > 0 {
			sellRatio, reason := 0.0, ""
			profit := 0.0
			if avg > 0 {
				profit = price/avg - 1
			}
			switch sig {
			case sigSellStrong:
				if profit >= rule.SellStrongMinProfit {
					sellRatio, reason = 1.0, fmt.Sprintf("sell_strong(%+.1f%%)", profit*100)
				}
			case sigSell:
				if profit >= rule.SellStrongMinProfit {
					sellRatio, reason = 0.5, fmt.Sprintf("sell(%+.1f%%)", profit*100)
				}
			}
			if sellRatio == 0 && peak > 0 && price > avg*0.99 && price <= peak*(1+rule.TrailingPct) {
				sellRatio, reason = 1.0, fmt.Sprintf("trail(%+.1f%%)", (price/peak-1)*100)
			}
			if sellRatio == 0 && avg > 0 && price <= avg*(1+rule.BackstopPct) {
				sellRatio, reason = 1.0, fmt.Sprintf("backstop(%+.1f%%)", (price/avg-1)*100)
			}
			if sellRatio > 0 {
				sold := qty * sellRatio
				cash += sold * price * (1 - feeRate)
				cost *= (1 - sellRatio)
				qty -= sold
				nSells++
				lastTrade = cs[i].T
				if len(trades) < maxTrades {
					trades = append(trades, TradeEvent{T: cs[i].T.Format("2006-01-02T15:04:05"),
						Action: "sell", Price: price, Qty: sold, Reason: reason})
				}
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
			limit := equity*0.50 - qty*price
			if limit < 0 {
				limit = 0
			}
			if amt > limit {
				amt = limit
			}
			if amt >= minTradeKRW {
				buyQty := amt / price * (1 - feeRate)
				qty += buyQty
				cost += amt
				cash -= amt
				nBuys++
				lastTrade = cs[i].T
				if len(trades) < maxTrades {
					trades = append(trades, TradeEvent{T: cs[i].T.Format("2006-01-02T15:04:05"),
						Action: "buy", Price: price, Qty: buyQty,
						Reason: fmt.Sprintf("%s(RSI %.0f)", sigName(sig), ind.RSI[i])})
				}
			}
		}
	}

	finalPrice := cs[len(cs)-1].Close
	final := cash + qty*finalPrice

	// Buy&Hold 최종
	holdExit := finalPrice * (1 - feeRate)
	holdPct := (holdExit/(holdEntryPrice/(1-feeRate)) - 1) * 100
	holdFinal := holdQty * finalPrice

	// DCA 최종 (정규화된 기준)
	var dcaPct, dcaFinalNorm float64
	dcaFinalNorm = cashInit
	if dcaInvested > 0 {
		coinValue := dcaQty * finalPrice
		dcaPct = (coinValue/dcaInvested - 1) * 100
		dcaFinalNorm = (coinValue / dcaInvested) * cashInit
	}

	// 마지막 포인트 보장
	lastT := cs[len(cs)-1].T.Format("2006-01-02T15:04:05")
	if len(eq) == 0 || eq[len(eq)-1].T != lastT {
		eq = append(eq, EquityPoint{T: lastT, V: final, P: finalPrice})
	}
	if len(holdCurve) == 0 || holdCurve[len(holdCurve)-1].T != lastT {
		holdCurve = append(holdCurve, EquityPoint{T: lastT, V: holdFinal, P: finalPrice})
	}
	if len(dcaCurve) == 0 || dcaCurve[len(dcaCurve)-1].T != lastT {
		dcaCurve = append(dcaCurve, EquityPoint{T: lastT, V: dcaFinalNorm, P: finalPrice})
	}

	return CoinResult{
		PnLPct:  (final/cashInit - 1) * 100,
		MaxDD:   maxDD * 100,
		NBuys:   nBuys, NSells: nSells, Final: final,
		HoldPct: holdPct, HoldCurve: holdCurve,
		DCAPct:  dcaPct, DCACurve: dcaCurve, DCAInvested: dcaInvested,
		Equity:  eq, Trades: trades,
	}
}

func sigName(s signal) string {
	switch s {
	case sigBuyStrong:
		return "buy_strong"
	case sigBuy:
		return "buy"
	case sigSellStrong:
		return "sell_strong"
	case sigSell:
		return "sell"
	}
	return "hold"
}

// ─────────────────────────────────────────────────────
// HTTP 핸들러
// ─────────────────────────────────────────────────────

func handleMeta(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	dataMu.RLock()
	defer dataMu.RUnlock()
	type intervalInfo struct {
		Interval string            `json:"interval"`
		Minutes  int               `json:"minutes"`
		Coins    []string          `json:"coins"`
		Ranges   map[string][2]string `json:"ranges"` // coin → [start, end]
		Counts   map[string]int    `json:"counts"`
	}
	var result []intervalInfo
	for _, iv := range intervals {
		d, ok := allData[iv]
		if !ok || len(d) == 0 {
			continue
		}
		coins := make([]string, 0, len(d))
		for k := range d {
			coins = append(coins, k)
		}
		sort.Strings(coins)
		ranges := map[string][2]string{}
		counts := map[string]int{}
		for coin, ds := range d {
			ranges[coin] = [2]string{
				ds.Candles[0].T.Format("2006-01-02"),
				ds.Candles[len(ds.Candles)-1].T.Format("2006-01-02"),
			}
			counts[coin] = len(ds.Candles)
		}
		result = append(result, intervalInfo{
			Interval: iv, Minutes: intervalMinutes[iv],
			Coins: coins, Ranges: ranges, Counts: counts,
		})
	}
	_ = json.NewEncoder(w).Encode(result)
}

func handleBacktest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var req BacktestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	dataMu.RLock()
	coinData := allData[req.Interval]
	dataMu.RUnlock()
	if coinData == nil {
		http.Error(w, "interval not loaded: "+req.Interval, 400)
		return
	}

	// 기본값 세팅
	if req.CashInit <= 0 {
		req.CashInit = 10_000_000
	}
	if req.Rule.BasePct <= 0 {
		req.Rule.BasePct = 0.30
	}
	if req.Rule.MinHoldMinutes <= 0 {
		req.Rule.MinHoldMinutes = 1440
	}

	ivMin := intervalMinutes[req.Interval]
	cycleMin := int(req.CycleHours * 60)
	if cycleMin < ivMin {
		cycleMin = ivMin
	}
	skip := cycleMin / ivMin
	if skip < 1 {
		skip = 1
	}

	// 타겟 코인
	coins := req.Coins
	if len(coins) == 0 || (len(coins) == 1 && (coins[0] == "" || strings.ToUpper(coins[0]) == "ALL")) {
		coins = nil
		for k := range coinData {
			coins = append(coins, k)
		}
		sort.Strings(coins)
	}

	var perCoin []CoinResult
	var sumPnL, sumDD float64
	var totalBuys, totalSells int
	for _, coin := range coins {
		ds := coinData[coin]
		if ds == nil {
			continue
		}
		// last_days → 캔들 개수
		var startIdx int
		if req.LastDays > 0 {
			candlesPerDay := 1440 / ivMin
			need := req.LastDays * candlesPerDay
			if need < len(ds.Candles) {
				startIdx = len(ds.Candles) - need
			}
		}
		if startIdx < 40 {
			startIdx = 40
		}
		res := backtestOne(ds, req.Rule, skip, startIdx, req.CashInit, 200, req.Reverse)
		res.Coin = coin
		perCoin = append(perCoin, res)
		sumPnL += res.PnLPct
		sumDD += res.MaxDD
		totalBuys += res.NBuys
		totalSells += res.NSells
	}
	n := float64(len(perCoin))
	if n == 0 {
		n = 1
	}
	resp := BacktestResponse{
		Interval: req.Interval, CycleHours: req.CycleHours, Rule: req.Rule,
		PerCoin:   perCoin,
		AvgPnL:    sumPnL / n,
		AvgMaxDD:  sumDD / n,
		TotalBuys: totalBuys, TotalSells: totalSells,
	}
	_ = json.NewEncoder(w).Encode(resp)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	dataMu.RLock()
	counts := map[string]int{}
	for iv, d := range allData {
		counts[iv] = len(d)
	}
	dataMu.RUnlock()
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "loaded": counts})
}

func main() {
	dataRoot := flag.String("data", "../data", "캔들 데이터 루트")
	addr := flag.String("addr", ":5051", "listen addr")
	flag.Parse()

	log.Printf("loading from %s ...", *dataRoot)
	t0 := time.Now()
	loadAll(*dataRoot)
	log.Printf("load complete in %.2fs", time.Since(t0).Seconds())

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/meta", handleMeta)
	mux.HandleFunc("/backtest", handleBacktest)

	log.Printf("listening on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}
