#!/usr/bin/env python3
"""알고리즘 신호 생성기 - CLAUDE.md의 매매 규칙을 결정론적으로 평가해서
signals.json 작성. run_cycle.sh는 has_non_hold == true일 때만 Claude 호출."""

import json
from datetime import datetime
from pathlib import Path

from analyzer import calc_macd

BASE_DIR = Path(__file__).parent
CONFIG = json.loads((BASE_DIR / "config.json").read_text())


def _prev_macd_hist(candles_1d):
    """직전 일봉까지의 MACD 히스토그램 — 골든/데드 크로스 판단용."""
    if len(candles_1d) < 36:
        return None
    closes_prev = [c["close"] for c in candles_1d[:-1]]
    _, _, prev_hist = calc_macd(
        closes_prev,
        CONFIG["indicators"]["macd_fast"],
        CONFIG["indicators"]["macd_slow"],
        CONFIG["indicators"]["macd_signal"],
    )
    return prev_hist


def classify(market, mdata, state_holding):
    """단일 코인 신호 분류. 일봉 지표 기반 (v5)."""
    ind = mdata.get("indicators", {})
    ticker = mdata.get("ticker", {})

    price = ticker.get("trade_price")
    change_pct = (ticker.get("signed_change_rate") or 0) * 100

    # PRIMARY — 일봉 지표
    rsi_1d = ind.get("rsi_1d")
    macd_1d = ind.get("macd_1d") or {}
    macd_hist_1d = macd_1d.get("histogram")
    prev_hist_1d = ind.get("macd_prev_hist_1d")
    bb_1d = ind.get("bollinger_1d") or {}
    bb_upper = bb_1d.get("upper")
    bb_lower = bb_1d.get("lower")
    vol_ratio = ind.get("volume_ratio_1d")
    trend = ind.get("trend_1d", "횡보")

    # 보조 — 15m (AI 판단 컨텍스트)
    rsi_15m = ind.get("rsi_15m")
    rsi_1h = ind.get("rsi_1h")
    macd_hist_15m = (ind.get("macd_15m") or {}).get("histogram")
    macd_hist_1h = (ind.get("macd_1h") or {}).get("histogram")

    macd_golden = (
        prev_hist_1d is not None
        and macd_hist_1d is not None
        and prev_hist_1d < 0 <= macd_hist_1d
    )
    macd_dead = (
        prev_hist_1d is not None
        and macd_hist_1d is not None
        and prev_hist_1d > 0 >= macd_hist_1d
    )
    # 음수에서 덜 음수로 전환 (반등 기미)
    hist_rising_from_neg = (
        prev_hist_1d is not None
        and macd_hist_1d is not None
        and prev_hist_1d < 0
        and macd_hist_1d > prev_hist_1d
    )

    near_bb_lower = (
        price is not None and bb_lower is not None and price <= bb_lower * 1.02
    )
    near_bb_upper = (
        price is not None and bb_upper is not None and price >= bb_upper * 0.98
    )

    rules = [
        {
            "rule": "적극 매수",
            "signal": "buy_strong",
            "checks": [
                ("RSI1d ≤ 35", rsi_1d is not None and rsi_1d <= 35, rsi_1d),
                ("MACD(1d) 반등", macd_golden or hist_rising_from_neg,
                 f"prev {prev_hist_1d} → cur {macd_hist_1d}"),
                ("거래량비율 1d ≥ 1.3", vol_ratio is not None and vol_ratio >= 1.3, vol_ratio),
            ],
        },
        {
            "rule": "적극 매도",
            "signal": "sell_strong",
            "checks": [
                ("RSI1d ≥ 70", rsi_1d is not None and rsi_1d >= 70, rsi_1d),
                ("MACD(1d) 데드크로스", macd_dead, f"prev {prev_hist_1d} → cur {macd_hist_1d}"),
            ],
        },
        {
            "rule": "매수 고려",
            "signal": "buy",
            "checks": [
                ("RSI1d ≤ 40", rsi_1d is not None and rsi_1d <= 40, rsi_1d),
                ("볼린저(1d) 하단 근접", near_bb_lower, f"price {price} / lower {bb_lower}"),
                ("일봉 추세≠하락", trend != "하락", trend),
            ],
        },
        {
            "rule": "매도 고려",
            "signal": "sell",
            "checks": [
                ("RSI1d ≥ 65", rsi_1d is not None and rsi_1d >= 65, rsi_1d),
                ("볼린저(1d) 상단 근접", near_bb_upper, f"price {price} / upper {bb_upper}"),
                ("일봉 추세=하락", trend == "하락", trend),
            ],
        },
    ]

    matched = None
    for r in rules:
        if all(ok for _, ok, _ in r["checks"]):
            matched = r
            break

    has_holding = bool(state_holding and state_holding.get("qty", 0) > 0)
    if matched and matched["signal"].startswith("sell") and not has_holding:
        matched = None  # 보유 없으면 매도 신호 무효

    signal = matched["signal"] if matched else "hold"

    coin = market.replace("KRW-", "")

    per_coin = {
        "coin": coin,
        "price": price,
        "change_pct": round(change_pct, 2),
        "trend": trend,  # 일봉 추세
        "rsi": {"15m": rsi_15m, "1h": rsi_1h, "1d": rsi_1d},
        "macd_hist_1d": macd_hist_1d,
        "macd_prev_hist_1d": prev_hist_1d,
        "macd_hist_15m": macd_hist_15m,
        "macd_hist_1h": macd_hist_1h,
        "volume_ratio_1d": vol_ratio,
        "bb_1d": {"upper": bb_upper, "lower": bb_lower},
        "signal": signal,
        "matched_rule": matched["rule"] if matched else None,
    }

    conditions = {
        "coin": coin,
        "signal": signal,
        "rules": [
            {
                "rule": r["rule"],
                "signal": r["signal"],
                "matched": all(ok for _, ok, _ in r["checks"]),
                "checks": [
                    {"name": name, "ok": ok, "value": val}
                    for name, ok, val in r["checks"]
                ],
            }
            for r in rules
        ],
    }

    triggers = []
    if signal == "hold":
        for r in rules[:3]:  # buy_strong, sell_strong, buy 대상
            if r["signal"] == "sell_strong" and not has_holding:
                continue
            missing = [name for name, ok, _ in r["checks"] if not ok]
            if 0 < len(missing) <= 2:
                triggers.append(
                    {"coin": coin, "rule": r["rule"], "missing": missing}
                )

    return per_coin, conditions, triggers


def build_actions(per_coin_map, state):
    """신호 → 매매 주문 변환.
    매수 금액은 **평가금액(현금+코인) 기준 퍼센트**로 산출하고, 남은 현금을 상한으로 둔다.
    손실 후에도 매수 규모가 의미 있는 수준으로 유지됨.
    """
    actions = []
    cash = state.get("cash", 0)
    holdings = state.get("holdings", {}) or {}
    # 평가금액 = 현금 + 각 코인 보유평가 (현재가 없으면 평단가로 대체)
    per_coin_price = {m: pc.get("price") for m, pc in per_coin_map.items()}
    equity = cash + sum(
        (per_coin_price.get(m) or h.get("avg_price", 0)) * h.get("qty", 0)
        for m, h in holdings.items()
    )
    max_pct = CONFIG["safety"]["max_single_trade_pct"]  # 0.30
    buy_pct = 0.10

    # sell_strong 익절 조건 — 평단 대비 +X% 이상에서만 발동 (v5)
    min_profit = CONFIG["safety"].get("sell_strong_min_profit_pct", 0.03)

    # 공평한 현금 배분을 위해 buy/buy_strong 코인 리스트 먼저 수집
    buy_orders = []
    sell_orders = []
    for market, pc in per_coin_map.items():
        sig = pc["signal"]
        note = _short_note(pc)
        price = pc.get("price")
        h = holdings.get(market, {})
        avg = h.get("avg_price", 0)
        profit_pct = ((price / avg) - 1) if (price and avg > 0) else 0

        if sig == "buy_strong":
            buy_orders.append((market, sig, max_pct, note))
        elif sig == "buy":
            buy_orders.append((market, sig, buy_pct, note))
        elif sig == "sell_strong":
            if profit_pct >= min_profit:
                sell_orders.append({
                    "action": "sell", "market": market, "sell_pct": 1.0,
                    "reason": f"[ALGO] 적극매도(익절 {profit_pct*100:+.1f}%) - {note}",
                })
            # 손실 구간이면 매도 보류 (v5 익절 전용)
        elif sig == "sell":
            if profit_pct >= min_profit:
                sell_orders.append({
                    "action": "sell", "market": market, "sell_pct": 0.5,
                    "reason": f"[ALGO] 부분매도(익절 {profit_pct*100:+.1f}%) - {note}",
                })

    # 매수: 평가금액 × 비율, 남은 현금을 여러 주문이 나눠쓰도록 공평 분배
    remaining_cash = cash
    total_demand = sum(int(equity * p) for _, _, p, _ in buy_orders)
    for market, sig, pct, note in buy_orders:
        target = int(equity * pct)
        # 동시에 여러 매수 신호가 있고 현금이 부족하면 비율대로 분할
        if total_demand > cash and total_demand > 0:
            target = int(target * cash / total_demand)
        amt = min(target, remaining_cash)
        if amt < 5000:  # 최소 주문 금액
            continue
        label = "적극매수" if sig == "buy_strong" else "소량매수"
        actions.append({
            "action": "buy", "market": market, "amount_krw": amt,
            "reason": f"[ALGO] {label} - {note}",
        })
        remaining_cash -= amt

    actions.extend(sell_orders)
    return actions


def _short_note(pc):
    price = pc.get("price")
    rsi = (pc.get("rsi") or {}).get("15m")
    vr = pc.get("volume_ratio_15m")
    hist = pc.get("macd_hist_15m")
    parts = []
    if price is not None:
        parts.append(f"₩{price:,.0f}({pc.get('change_pct', 0):+.2f}%)")
    if rsi is not None:
        parts.append(f"RSI15m {rsi}")
    if hist is not None:
        parts.append(f"MACD {hist}")
    if vr is not None:
        parts.append(f"vol {vr}x")
    parts.append(pc.get("trend", "-"))
    return " · ".join(parts)


def run():
    data_path = BASE_DIR / "market_data" / "latest.json"
    state_path = BASE_DIR / "state.json"
    if not data_path.exists():
        print("[ERROR] latest.json 없음")
        return None

    data = json.loads(data_path.read_text())
    state = (
        json.loads(state_path.read_text())
        if state_path.exists()
        else {"cash": CONFIG["initial_capital"], "holdings": {}}
    )
    holdings = state.get("holdings", {})

    per_coin_map = {}
    conditions_checked = []
    triggers_next_cycle = []

    for market, mdata in data.get("markets", {}).items():
        per_coin, conds, triggers = classify(market, mdata, holdings.get(market))
        per_coin_map[market] = per_coin
        conditions_checked.append(conds)
        triggers_next_cycle.extend(triggers)

    signals_by_coin = {m.replace("KRW-", ""): pc["signal"] for m, pc in per_coin_map.items()}
    non_hold_coins = [c for c, s in signals_by_coin.items() if s != "hold"]

    if non_hold_coins:
        parts = [f"{c}:{signals_by_coin[c]}" for c in non_hold_coins]
        auto_summary = f"알고리즘 신호 감지 — {', '.join(parts)}. 나머지 관망."
    else:
        auto_summary = "알고리즘 규칙 전 종목 미충족(hold). 트리거 대기."

    if any(s == "sell_strong" for s in signals_by_coin.values()):
        auto_risk = "중간~높음 - 매도 트리거 발동"
    elif any(s.startswith("buy") for s in signals_by_coin.values()):
        auto_risk = "중간 - 진입 시그널"
    else:
        auto_risk = "낮음 - 관망 유지"

    actions = build_actions(per_coin_map, state)
    has_non_hold = bool(non_hold_coins)

    out = {
        "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": "algo",
        "actions": actions,
        "per_coin": per_coin_map,
        "conditions_checked": conditions_checked,
        "triggers_next_cycle": triggers_next_cycle,
        "market_summary": auto_summary,
        "risk_assessment": auto_risk,
        "has_non_hold": has_non_hold,
    }

    (BASE_DIR / "signals.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2)
    )
    print(f"[OK] signals.json 생성 (has_non_hold={has_non_hold})")
    for c, s in signals_by_coin.items():
        print(f"  {c}: {s}")
    return out


if __name__ == "__main__":
    run()
