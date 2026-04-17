#!/usr/bin/env python3
"""과거 15분봉 데이터로 signals.py 룰을 돌려서 전략 성과 검증.

사용:
    venv/bin/python3 backtest.py           # 기본 30일
    venv/bin/python3 backtest.py --days 60

결과:
    - 최종 수익률 vs BTC HODL vs 등분산(10종) HODL
    - 코인별 거래 횟수/승률/평균 PnL
    - 룰별 발동 횟수
    - backtest_report.json / backtest_trades.csv
"""

import argparse
import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import pyupbit

from analyzer import calc_rsi, calc_macd, calc_bollinger, calc_ma, calc_volume_ratio

BASE_DIR = Path(__file__).parent
CONFIG = json.loads((BASE_DIR / "config.json").read_text())
MARKETS = CONFIG["markets"]
FEE = CONFIG["fee_rate"]
SAFE = CONFIG["safety"]
IND = CONFIG["indicators"]


def fetch_long_history(market, total_count, interval="minute15"):
    """pyupbit는 내부적으로 페이지네이션. count만 주면 알아서 긁어옴."""
    df = pyupbit.get_ohlcv(market, interval=interval, count=total_count)
    if df is None or df.empty:
        return []
    return [
        {
            "timestamp": idx.to_pydatetime(),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]),
        }
        for idx, row in df.iterrows()
    ]


def classify_at(candles_slice, holding_qty, rule_set="v1", rsi_1d=None):
    """현재 시점까지의 15분봉만으로 신호 산출.
    rule_set:
      v1 = signals.py 원본 규칙
      v2 = 제안안 적용:
           - 적극매수 완화: RSI≤35 AND (골든크로스 OR 히스토그램 상승전환) AND vol≥1.3
           - 매수고려 안전장치: trend != '하락' AND rsi_1d가 있으면 ≤65 (과열 필터)
    """
    if len(candles_slice) < 40:
        return "hold", None
    closes = [c["close"] for c in candles_slice]
    rsi = calc_rsi(closes, IND["rsi_period"])
    _, _, hist = calc_macd(closes, IND["macd_fast"], IND["macd_slow"], IND["macd_signal"])
    _, _, prev_hist = calc_macd(
        closes[:-1], IND["macd_fast"], IND["macd_slow"], IND["macd_signal"]
    )
    bb_u, _, bb_l = calc_bollinger(closes, IND["bb_period"], IND["bb_std"])
    vr = calc_volume_ratio(candles_slice)
    ma5 = calc_ma(closes, 5)
    ma20 = calc_ma(closes, 20)
    price = closes[-1]

    trend = "횡보"
    if ma5 and ma20:
        if ma5 > ma20 and price > ma5:
            trend = "상승"
        elif ma5 < ma20 and price < ma5:
            trend = "하락"

    macd_golden = prev_hist is not None and hist is not None and prev_hist < 0 <= hist
    macd_dead = prev_hist is not None and hist is not None and prev_hist > 0 >= hist
    hist_rising_from_neg = (
        prev_hist is not None and hist is not None
        and prev_hist < 0 and hist > prev_hist
    )
    near_bb_lower = bb_l is not None and price <= bb_l * 1.02
    near_bb_upper = bb_u is not None and price >= bb_u * 0.98

    if rule_set in ("v2", "v4"):
        buy_strong_ok = (
            rsi is not None and rsi <= 35
            and (macd_golden or hist_rising_from_neg)
            and vr is not None and vr >= 1.3
        )
        buy_ok = (
            rsi is not None and rsi <= 40
            and near_bb_lower
            and trend != "하락"
            and (rsi_1d is None or rsi_1d <= 65)
        )
        # v4: 매수 고려에 거래량 평균 이상 필터 추가
        if rule_set == "v4":
            buy_ok = buy_ok and (vr is not None and vr >= 1.0)
    else:
        buy_strong_ok = (
            rsi is not None and rsi <= 30 and macd_golden
            and vr is not None and vr >= 1.5
        )
        buy_ok = (
            rsi is not None and rsi <= 40 and near_bb_lower and trend == "상승"
        )

    rules = [
        ("buy_strong", "적극 매수", buy_strong_ok),
        ("sell_strong", "적극 매도",
         rsi is not None and rsi >= 70 and macd_dead),
        ("buy", "매수 고려", buy_ok),
        ("sell", "매도 고려",
         rsi is not None and rsi >= 65 and near_bb_upper and trend == "하락"),
    ]
    for sig, name, ok in rules:
        if ok:
            if sig.startswith("sell") and holding_qty <= 0:
                continue
            return sig, name
    return "hold", None


def build_daily_rsi_lookup(candles_15m):
    """15m 캔들 → 일자별 마지막 close → 매 일자 RSI(14).
    key=date, value=해당 날짜까지 포함한 1d RSI."""
    by_date = {}
    for c in candles_15m:
        by_date[c["timestamp"].date()] = c["close"]
    dates = sorted(by_date.keys())
    closes = [by_date[d] for d in dates]
    out = {}
    for i, d in enumerate(dates):
        out[d] = calc_rsi(closes[: i + 1], 14) if i + 1 >= 15 else None
    return out


def run_sim(history, ts_index, common_ts, start_idx, rule_set, rsi1d_lookup,
            trailing_stop=False, trailing_profit_only=False):
    """하나의 룰셋으로 시뮬레이션 실행.
    trailing_stop=True이면 포지션별 -7% 트레일링 손절.
    trailing_profit_only=True이면 수익 구간(현재가>평단가)에서만 트레일링."""
    trail_pct = SAFE.get("trailing_stop_pct", -0.07)
    cash = CONFIG["initial_capital"]
    holdings = {}  # market -> {qty, avg_price, bought_at, peak_price}
    trades = []
    trades_per_day = defaultdict(int)
    rule_hits = defaultdict(int)
    equity_curve = []
    start_prices = {}
    last_prices = {}

    for step, ts in enumerate(common_ts[start_idx:], start=start_idx):
        day_key = ts.date().isoformat()
        current_prices = {}
        for m in MARKETS:
            if m not in ts_index or ts not in ts_index[m]:
                continue
            i = ts_index[m][ts]
            current_prices[m] = history[m][i]["close"]

        if not start_prices:
            start_prices = dict(current_prices)
        last_prices = dict(current_prices)

        # peak_price 갱신 + 트레일링 손절
        if trailing_stop:
            for m, h in list(holdings.items()):
                price = current_prices.get(m)
                if not price or h["qty"] <= 0:
                    continue
                # profit_only: 수익 구간에서만 트레일링 활성화
                if trailing_profit_only and price <= h["avg_price"]:
                    h["peak_price"] = h["avg_price"]  # 손실 구간이면 peak 리셋
                    continue
                peak = h.get("peak_price", h["avg_price"])
                if price > peak:
                    peak = price
                h["peak_price"] = peak
                drop = (price - peak) / peak if peak > 0 else 0
                if drop <= trail_pct:
                    pnl = (price / h["avg_price"] - 1) * 100
                    cash += price * h["qty"] * (1 - FEE)
                    trades.append({
                        "ts": ts.isoformat(), "market": m, "action": "sell",
                        "price": price, "qty": h["qty"],
                        "reason": f"trailing_stop_{trail_pct:.0%}",
                        "pnl_pct": round(pnl, 2),
                    })
                    rule_hits["트레일링 손절"] += 1
                    del holdings[m]

        equity = cash + sum(
            current_prices.get(m, 0) * h["qty"] for m, h in holdings.items()
        )

        # 전체 포트폴리오 -15% 백스톱
        if equity < CONFIG["initial_capital"] * (1 + SAFE["max_loss_pct"]):
            for m, h in list(holdings.items()):
                price = current_prices.get(m)
                if price:
                    cash += price * h["qty"] * (1 - FEE)
                    trades.append({
                        "ts": ts.isoformat(), "market": m, "action": "sell",
                        "price": price, "qty": h["qty"], "reason": "stop_loss_-15%",
                        "pnl_pct": round((price / h["avg_price"] - 1) * 100, 2),
                    })
                    del holdings[m]
            continue

        for m in MARKETS:
            if m not in ts_index or ts not in ts_index[m]:
                continue
            i = ts_index[m][ts]
            if i < 40:
                continue
            # 지표 계산에 최근 100개 캔들이면 충분 (MACD 워밍업 ~35, BB 20, RSI 15)
            window_start = max(0, i - 99)
            candles_slice = history[m][window_start: i + 1]
            holding = holdings.get(m)
            qty = holding["qty"] if holding else 0
            rsi_1d = rsi1d_lookup[m].get(ts.date())
            signal, rule = classify_at(candles_slice, qty, rule_set=rule_set, rsi_1d=rsi_1d)

            if signal == "hold":
                continue
            if trades_per_day[day_key] >= SAFE["max_trades_per_day"]:
                continue

            price = current_prices[m]

            if signal in ("buy_strong", "buy"):
                if holding:
                    if price * qty > equity * SAFE["max_single_coin_pct"]:
                        continue
                pct = SAFE["max_single_trade_pct"] if signal == "buy_strong" else 0.10
                amount = cash * pct
                if amount < 5000:
                    continue
                buy_qty = amount / price * (1 - FEE)
                new_qty = qty + buy_qty
                new_avg = (
                    (holding["avg_price"] * qty + price * buy_qty) / new_qty
                    if holding else price
                )
                peak = max(price, holding["peak_price"]) if holding and "peak_price" in holding else price
                holdings[m] = {"qty": new_qty, "avg_price": new_avg, "bought_at": ts, "peak_price": peak}
                cash -= amount
                rule_hits[rule] += 1
                trades_per_day[day_key] += 1
                trades.append({
                    "ts": ts.isoformat(), "market": m, "action": signal,
                    "price": price, "qty": buy_qty, "amount_krw": amount, "rule": rule,
                })
            elif signal in ("sell_strong", "sell") and holding:
                held_mins = (ts - holding["bought_at"]).total_seconds() / 60
                if held_mins < SAFE["min_hold_minutes"]:
                    continue
                sell_pct = 1.0 if signal == "sell_strong" else 0.5
                sell_qty = qty * sell_pct
                cash += price * sell_qty * (1 - FEE)
                pnl = (price / holding["avg_price"] - 1) * 100
                rule_hits[rule] += 1
                trades_per_day[day_key] += 1
                trades.append({
                    "ts": ts.isoformat(), "market": m, "action": signal,
                    "price": price, "qty": sell_qty, "rule": rule,
                    "pnl_pct": round(pnl, 2),
                })
                remain = qty - sell_qty
                if remain * price < 1000:
                    del holdings[m]
                else:
                    holding["qty"] = remain

        if step % 200 == 0:
            equity_curve.append({"ts": ts.isoformat(), "equity": round(equity)})

    final_equity = cash + sum(
        last_prices.get(m, 0) * h["qty"] for m, h in holdings.items()
    )
    return final_equity, trades, rule_hits, equity_curve, start_prices, last_prices


def backtest(days, compare=True):
    total_candles = days * 24 * 4 + 60
    print(f"[INFO] {days}일 × 10종 백테스트 시작 (캔들 {total_candles}개/종목)")

    history = {}
    for m in MARKETS:
        print(f"  수집: {m}")
        history[m] = fetch_long_history(m, total_candles)
        if not history[m]:
            print(f"  [WARN] {m} 데이터 없음")

    timelines = [set(c["timestamp"] for c in h) for h in history.values() if h]
    common_ts = sorted(set.intersection(*timelines)) if timelines else []
    if not common_ts:
        print("[ERROR] 공통 타임라인 없음")
        return
    start_idx = 40
    ts_index = {m: {c["timestamp"]: i for i, c in enumerate(h)} for m, h in history.items() if h}
    rsi1d_lookup = {m: build_daily_rsi_lookup(h) for m, h in history.items() if h}

    sims = [
        ("v1",  "v1", False, False),
        ("v2",  "v2", False, False),
        ("v3p", "v2", True,  True),   # v2 + 트레일링(수익 구간만)
        ("v4",  "v4", False, False),  # v2 + 매수고려 거래량≥1.0 필터
        ("v4p", "v4", True,  True),   # v4 + 트레일링(수익 구간만)
    ] if compare else [("v1", "v1", False, False)]
    results = {}
    for label, rs, trail, profit_only in sims:
        tag = f"{label}({rs}{'+ trail' if trail else ''}{'(profit)' if profit_only else ''})"
        print(f"\n[SIM] {tag} 실행...")
        fin, trades, rule_hits, curve, start_px, last_px = run_sim(
            history, ts_index, common_ts, start_idx, rs, rsi1d_lookup,
            trailing_stop=trail, trailing_profit_only=profit_only,
        )
        results[label] = {
            "final": fin, "trades": trades, "rule_hits": rule_hits,
            "curve": curve, "start_px": start_px, "last_px": last_px,
        }
    rule_sets = [label for label, *_ in sims] if compare else ["v1"]

    # 공통 벤치마크
    any_r = results[rule_sets[0]]
    start_px, last_px = any_r["start_px"], any_r["last_px"]
    btc_return = (last_px["KRW-BTC"] / start_px["KRW-BTC"] - 1) * 100
    eq_weight = sum(
        (last_px[m] / start_px[m] - 1) for m in MARKETS if m in start_px
    ) / len([m for m in MARKETS if m in start_px]) * 100

    print("\n" + "=" * 72)
    print(f"백테스트 결과 ({days}일, {len(common_ts[start_idx:])} 틱)")
    print("=" * 72)
    print(f"BTC HODL:       {btc_return:>+7.2f}%")
    print(f"10종 균등 HODL: {eq_weight:>+7.2f}%")
    print()
    print(f"{'룰셋':<8} {'최종평가':>14} {'수익률':>9} {'거래수':>7} {'승/패':>8} {'승률':>7}")
    for rs in rule_sets:
        r = results[rs]
        ret = (r["final"] / CONFIG["initial_capital"] - 1) * 100
        buys = sum(1 for t in r["trades"] if t["action"].startswith("buy"))
        sells = sum(1 for t in r["trades"] if t["action"].startswith("sell") and "pnl_pct" in t)
        wins = sum(1 for t in r["trades"] if t["action"].startswith("sell") and t.get("pnl_pct", 0) > 0)
        losses = sum(1 for t in r["trades"] if t["action"].startswith("sell") and t.get("pnl_pct", 0) < 0)
        win_rate = wins / (wins + losses) * 100 if wins + losses else 0
        print(f"{rs:<8} {r['final']:>14,.0f} {ret:>+8.2f}% {len(r['trades']):>7} {wins:>3}/{losses:<3} {win_rate:>6.1f}%")

    # 룰 발동 분포
    print("\n[룰 발동 비교]")
    all_rules = sorted(set().union(*[r["rule_hits"].keys() for r in results.values()]))
    print(f"  {'룰':<14}" + "".join(f"{rs:>8}" for rs in rule_sets))
    for rule in all_rules:
        print(f"  {rule:<14}" + "".join(f"{results[rs]['rule_hits'].get(rule, 0):>8}" for rs in rule_sets))

    # 코인별 v1 vs v2
    def per_coin_stats(trades):
        pc = defaultdict(lambda: {"buys": 0, "sells": 0, "wins": 0, "losses": 0, "pnl_sum": 0.0})
        for t in trades:
            c = pc[t["market"]]
            if t["action"].startswith("buy"):
                c["buys"] += 1
            else:
                c["sells"] += 1
                pnl = t.get("pnl_pct", 0)
                c["pnl_sum"] += pnl
                if pnl > 0: c["wins"] += 1
                elif pnl < 0: c["losses"] += 1
        return pc

    print("\n[코인별 성과]")
    header = f"  {'시장':<10}"
    for rs in rule_sets:
        header += f"  {rs}매수/매도  {rs}승/패  {rs}평균%"
    print(header)
    stats_by_rs = {rs: per_coin_stats(results[rs]["trades"]) for rs in rule_sets}
    for m in MARKETS:
        row = f"  {m:<10}"
        for rs in rule_sets:
            c = stats_by_rs[rs][m]
            avg = c["pnl_sum"] / c["sells"] if c["sells"] else 0
            row += f"   {c['buys']:>3}/{c['sells']:<3}   {c['wins']:>3}/{c['losses']:<3}  {avg:>+6.2f}"
        print(row)

    # 저장
    report = {
        "days": days,
        "ticks": len(common_ts[start_idx:]),
        "btc_hodl_pct": round(btc_return, 2),
        "eq_weight_hodl_pct": round(eq_weight, 2),
        "rule_sets": {
            rs: {
                "final": results[rs]["final"],
                "return_pct": round((results[rs]["final"] / CONFIG["initial_capital"] - 1) * 100, 2),
                "trades": len(results[rs]["trades"]),
                "rule_hits": dict(results[rs]["rule_hits"]),
                "per_coin": {m: dict(stats_by_rs[rs][m]) for m in MARKETS},
            }
            for rs in rule_sets
        },
    }
    (BASE_DIR / "backtest_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, default=str)
    )
    for rs in rule_sets:
        with open(BASE_DIR / f"backtest_trades_{rs}.csv", "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["ts", "market", "action", "price", "qty", "amount_krw", "rule", "pnl_pct", "reason"])
            for t in results[rs]["trades"]:
                w.writerow([
                    t["ts"], t["market"], t["action"], t["price"], t["qty"],
                    t.get("amount_krw", ""), t.get("rule", ""), t.get("pnl_pct", ""),
                    t.get("reason", ""),
                ])
    print(f"\n→ backtest_report.json, backtest_trades_v1.csv, backtest_trades_v2.csv")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=120)
    p.add_argument("--rule-set", choices=["v1", "v2", "both"], default="both")
    args = p.parse_args()
    backtest(args.days, compare=(args.rule_set == "both"))
