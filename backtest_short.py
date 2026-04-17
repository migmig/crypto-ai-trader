#!/usr/bin/env python3
"""공매도 포함 백테스트 — v4p(롱전용) vs v4p+숏 비교.

공매도 규칙:
  - 숏 진입: RSI ≥ 70 + MACD 데드크로스 (기존 sell_strong 조건)
  - 숏 청산: RSI ≤ 40 또는 손절 -7% (가격이 진입가 대비 7% 상승)
  - 숏 비용: 일 0.02% 빌리기 이자
  - 숏 사이즈: 현금의 20% (롱보다 보수적)
"""
import json, argparse, time
from collections import defaultdict
from pathlib import Path
import pyupbit, sys
sys.path.insert(0, str(Path(__file__).parent))
from analyzer import calc_rsi, calc_macd, calc_bollinger, calc_ma, calc_volume_ratio

BASE = Path(__file__).parent
CONFIG = json.loads((BASE / "config.json").read_text())
MARKETS = CONFIG["markets"]
FEE = CONFIG["fee_rate"]
SAFE = CONFIG["safety"]
IND = CONFIG["indicators"]
SHORT_BORROW_DAILY = 0.0002  # 일 0.02%
SHORT_STOP = 0.07            # 7% 역행 시 손절

def fetch(market, count):
    df = pyupbit.get_ohlcv(market, interval="minute15", count=count)
    if df is None: return []
    return [{"timestamp": idx.to_pydatetime(),
             "open": float(r["open"]), "high": float(r["high"]),
             "low": float(r["low"]), "close": float(r["close"]),
             "volume": float(r["volume"])} for idx, r in df.iterrows()]

def classify(candles, long_qty, short_qty):
    """v4 룰 + 숏 신호 반환: (long_signal, short_signal)"""
    if len(candles) < 40:
        return "hold", "hold"
    closes = [c["close"] for c in candles]
    rsi = calc_rsi(closes, IND["rsi_period"])
    _, _, hist = calc_macd(closes, IND["macd_fast"], IND["macd_slow"], IND["macd_signal"])
    _, _, prev = calc_macd(closes[:-1], IND["macd_fast"], IND["macd_slow"], IND["macd_signal"])
    bb_u, _, bb_l = calc_bollinger(closes, IND["bb_period"], IND["bb_std"])
    vr = calc_volume_ratio(candles)
    ma5, ma20 = calc_ma(closes, 5), calc_ma(closes, 20)
    price = closes[-1]
    trend = "횡보"
    if ma5 and ma20:
        if ma5 > ma20 and price > ma5: trend = "상승"
        elif ma5 < ma20 and price < ma5: trend = "하락"

    golden = prev is not None and hist is not None and prev < 0 <= hist
    dead = prev is not None and hist is not None and prev > 0 >= hist
    hist_rise = prev is not None and hist is not None and prev < 0 and hist > prev
    near_lo = bb_l is not None and price <= bb_l * 1.02
    near_hi = bb_u is not None and price >= bb_u * 0.98

    # 롱 신호 (v4)
    long_sig = "hold"
    bs = rsi is not None and rsi <= 35 and (golden or hist_rise) and vr is not None and vr >= 1.3
    b = rsi is not None and rsi <= 40 and near_lo and trend != "하락" and vr is not None and vr >= 1.0
    ss = rsi is not None and rsi >= 70 and dead
    s = rsi is not None and rsi >= 65 and near_hi and trend == "하락"
    for sig, ok in [("buy_strong", bs), ("sell_strong", ss), ("buy", b), ("sell", s)]:
        if ok:
            if sig.startswith("sell") and long_qty <= 0: continue
            long_sig = sig
            break

    # 숏 신호
    short_sig = "hold"
    if rsi is not None and rsi >= 70 and dead and short_qty <= 0:
        short_sig = "short_open"      # 숏 진입
    elif rsi is not None and rsi <= 40 and short_qty > 0:
        short_sig = "short_close"     # 숏 청산 (반등 신호)

    return long_sig, short_sig

def daily_rsi_map(candles):
    by_date = {}
    for c in candles: by_date[c["timestamp"].date()] = c["close"]
    dates = sorted(by_date.keys())
    cl = [by_date[d] for d in dates]
    return {d: calc_rsi(cl[:i+1], 14) if i+1 >= 15 else None for i, d in enumerate(dates)}

def run(days):
    N = days * 96 + 60
    print(f"[INFO] {days}일 공매도 백테스트")
    print("수집 중...")
    history = {}
    for m in MARKETS:
        history[m] = fetch(m, N)
    tl = [set(c["timestamp"] for c in h) for h in history.values() if h]
    cts = sorted(set.intersection(*tl))
    si = 40
    tsi = {m: {c["timestamp"]: i for i, c in enumerate(h)} for m, h in history.items() if h}
    trail = SAFE.get("trailing_stop_pct", -0.07)

    # 두 가지 전략 동시 실행
    class Sim:
        def __init__(self, name, enable_short):
            self.name = name
            self.enable_short = enable_short
            self.cash = CONFIG["initial_capital"]
            self.longs = {}   # market -> {qty, avg, peak}
            self.shorts = {}  # market -> {qty, entry_price, opened_at}
            self.wins = 0; self.losses = 0; self.trades = 0
            self.short_wins = 0; self.short_losses = 0; self.short_trades = 0

        def value(self, prices):
            v = self.cash
            for m, h in self.longs.items():
                v += prices.get(m, 0) * h["qty"]
            for m, s in self.shorts.items():
                # 숏 평가: 진입가에서 현재가까지의 차이가 수익/손실
                pnl = (s["entry_price"] - prices.get(m, s["entry_price"])) * s["qty"]
                v += pnl
            return v

    sims = [Sim("v4p (롱전용)", False), Sim("v4p+숏", True)]
    sp = {}; lp = {}

    for step, ts in enumerate(cts[si:], start=si):
        day = ts.date()
        prices = {}
        for m in MARKETS:
            if m in tsi and ts in tsi[m]:
                prices[m] = history[m][tsi[m][ts]]["close"]
        if not sp: sp = dict(prices)
        lp = dict(prices)

        for sim in sims:
            # 롱 트레일링 (수익구간)
            for m, h in list(sim.longs.items()):
                p = prices.get(m)
                if not p or h["qty"] <= 0: continue
                if p <= h["avg"]:
                    h["peak"] = h["avg"]; continue
                pk = h.get("peak", h["avg"])
                if p > pk: pk = p
                h["peak"] = pk
                if (p - pk) / pk <= trail:
                    pnl = p / h["avg"] - 1
                    sim.cash += p * h["qty"] * (1 - FEE)
                    sim.trades += 1
                    if pnl > 0: sim.wins += 1
                    else: sim.losses += 1
                    del sim.longs[m]

            # 숏 손절 + 빌리기 이자
            if sim.enable_short:
                for m, s in list(sim.shorts.items()):
                    p = prices.get(m)
                    if not p: continue
                    # 빌리기 이자 (15분봉이니 1/96 일)
                    interest = s["entry_price"] * s["qty"] * SHORT_BORROW_DAILY / 96
                    sim.cash -= interest
                    # 손절: 가격이 진입가 대비 7% 상승
                    if p >= s["entry_price"] * (1 + SHORT_STOP):
                        loss = (p - s["entry_price"]) * s["qty"]
                        sim.cash -= loss + p * s["qty"] * FEE
                        sim.short_trades += 1
                        sim.short_losses += 1
                        del sim.shorts[m]

            # -15% 백스톱
            equity = sim.value(prices)
            if equity < CONFIG["initial_capital"] * 0.85:
                for m, h in list(sim.longs.items()):
                    p = prices.get(m)
                    if p: sim.cash += p * h["qty"] * (1 - FEE)
                    sim.trades += 1; sim.losses += 1
                sim.longs = {}
                for m, s in list(sim.shorts.items()):
                    p = prices.get(m, s["entry_price"])
                    pnl = (s["entry_price"] - p) * s["qty"]
                    sim.cash += pnl - p * s["qty"] * FEE
                    sim.short_trades += 1
                    if pnl > 0: sim.short_wins += 1
                    else: sim.short_losses += 1
                sim.shorts = {}
                continue

            # 신호 매매
            for m in MARKETS:
                if m not in tsi or ts not in tsi[m]: continue
                i = tsi[m][ts]
                if i < 40: continue
                w = max(0, i - 99)
                candles = history[m][w:i+1]
                p = prices[m]
                lq = sim.longs[m]["qty"] if m in sim.longs else 0
                sq = sim.shorts[m]["qty"] if m in sim.shorts else 0

                long_sig, short_sig = classify(candles, lq, sq)

                # 롱 매매
                if long_sig == "buy_strong":
                    amt = sim.cash * 0.30
                    if amt >= 5000:
                        qty = amt * (1 - FEE) / p
                        h = sim.longs.setdefault(m, {"qty": 0, "avg": p, "peak": p})
                        tot = h["qty"] + qty
                        h["avg"] = (h["avg"] * h["qty"] + p * qty) / tot if tot else p
                        h["qty"] = tot
                        h["peak"] = max(h.get("peak", p), p)
                        sim.cash -= amt
                        sim.trades += 1
                elif long_sig == "buy":
                    amt = sim.cash * 0.10
                    if amt >= 5000:
                        qty = amt * (1 - FEE) / p
                        h = sim.longs.setdefault(m, {"qty": 0, "avg": p, "peak": p})
                        tot = h["qty"] + qty
                        h["avg"] = (h["avg"] * h["qty"] + p * qty) / tot if tot else p
                        h["qty"] = tot
                        h["peak"] = max(h.get("peak", p), p)
                        sim.cash -= amt
                        sim.trades += 1
                elif long_sig == "sell_strong" and m in sim.longs:
                    h = sim.longs[m]
                    pnl = p / h["avg"] - 1
                    sim.cash += p * h["qty"] * (1 - FEE)
                    sim.trades += 1
                    if pnl > 0: sim.wins += 1
                    else: sim.losses += 1
                    del sim.longs[m]
                elif long_sig == "sell" and m in sim.longs:
                    h = sim.longs[m]
                    sq_sell = h["qty"] * 0.5
                    pnl = p / h["avg"] - 1
                    sim.cash += p * sq_sell * (1 - FEE)
                    sim.trades += 1
                    if pnl > 0: sim.wins += 1
                    else: sim.losses += 1
                    h["qty"] -= sq_sell
                    if h["qty"] * p < 100: del sim.longs[m]

                # 숏 매매
                if sim.enable_short:
                    if short_sig == "short_open" and m not in sim.shorts:
                        amt = sim.cash * 0.20  # 보수적 사이즈
                        if amt >= 5000:
                            qty = amt / p
                            sim.shorts[m] = {"qty": qty, "entry_price": p, "opened_at": ts}
                            sim.cash -= amt * FEE  # 진입 수수료
                            sim.short_trades += 1
                    elif short_sig == "short_close" and m in sim.shorts:
                        s = sim.shorts[m]
                        pnl = (s["entry_price"] - p) * s["qty"]
                        sim.cash += pnl - p * s["qty"] * FEE
                        sim.short_trades += 1
                        if pnl > 0: sim.short_wins += 1
                        else: sim.short_losses += 1
                        del sim.shorts[m]

    # 결과
    btc_ret = (lp["KRW-BTC"] / sp["KRW-BTC"] - 1) * 100

    print(f"\n{'='*72}")
    print(f"  {days}일 백테스트 | BTC {btc_ret:+.1f}%")
    print(f"{'='*72}")
    print(f"  {'전략':<18} {'평가':>12} {'수익률':>8} {'롱거래':>7} {'롱승/패':>8} {'숏거래':>7} {'숏승/패':>8}")
    print(f"  {'-'*66}")
    for sim in sims:
        v = sim.value(lp)
        ret = (v / CONFIG["initial_capital"] - 1) * 100
        lwr = f"{sim.wins}/{sim.losses}"
        swr = f"{sim.short_wins}/{sim.short_losses}" if sim.enable_short else "-"
        print(f"  {sim.name:<18} ₩{v:>10,.0f} {ret:>+7.2f}% {sim.trades:>7} {lwr:>8} {sim.short_trades:>7} {swr:>8}")
    print()

    # 숏 상세
    ss = sims[1]
    total_short = ss.short_wins + ss.short_losses
    sr = ss.short_wins / total_short * 100 if total_short else 0
    print(f"  [숏 상세]")
    print(f"  총 숏 거래: {ss.short_trades}건 (진입+청산+손절)")
    print(f"  숏 승률: {sr:.1f}% ({ss.short_wins}승/{ss.short_losses}패)")
    print(f"  현재 오픈 숏: {len(ss.shorts)}건")
    for m, s in ss.shorts.items():
        cur = lp.get(m, s["entry_price"])
        pnl = (s["entry_price"] - cur) / s["entry_price"] * 100
        print(f"    {m}: 진입 ₩{s['entry_price']:,.0f} → 현재 ₩{cur:,.0f} ({pnl:+.1f}%)")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=120)
    run(p.parse_args().days)
