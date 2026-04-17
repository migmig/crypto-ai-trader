#!/usr/bin/env python3
"""알고리즘 신호 생성기 - CLAUDE.md의 매매 규칙을 결정론적으로 평가해서
signals.json 작성. run_cycle.sh는 has_non_hold == true일 때만 Claude 호출."""

import json
from datetime import datetime
from pathlib import Path

from analyzer import calc_macd

BASE_DIR = Path(__file__).parent
CONFIG = json.loads((BASE_DIR / "config.json").read_text())


def _prev_macd_hist(candles_15m):
    """직전 사이클 MACD 히스토그램 — 골든/데드 크로스 판단용."""
    if len(candles_15m) < 36:
        return None
    closes_prev = [c["close"] for c in candles_15m[:-1]]
    _, _, prev_hist = calc_macd(
        closes_prev,
        CONFIG["indicators"]["macd_fast"],
        CONFIG["indicators"]["macd_slow"],
        CONFIG["indicators"]["macd_signal"],
    )
    return prev_hist


def classify(market, mdata, state_holding):
    """단일 코인 신호 분류."""
    ind = mdata.get("indicators", {})
    ticker = mdata.get("ticker", {})

    price = ticker.get("trade_price")
    change_pct = (ticker.get("signed_change_rate") or 0) * 100
    rsi_15m = ind.get("rsi_15m")
    rsi_1h = ind.get("rsi_1h")
    rsi_1d = ind.get("rsi_1d")
    macd_15m = ind.get("macd_15m") or {}
    macd_hist_15m = macd_15m.get("histogram")
    macd_hist_1h = (ind.get("macd_1h") or {}).get("histogram")
    bb = ind.get("bollinger_15m") or {}
    bb_upper = bb.get("upper")
    bb_lower = bb.get("lower")
    vol_ratio = ind.get("volume_ratio_15m")
    trend = ind.get("trend", "횡보")

    prev_hist = _prev_macd_hist(mdata.get("candles_15m", []))
    macd_golden = (
        prev_hist is not None
        and macd_hist_15m is not None
        and prev_hist < 0 <= macd_hist_15m
    )
    macd_dead = (
        prev_hist is not None
        and macd_hist_15m is not None
        and prev_hist > 0 >= macd_hist_15m
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
                ("RSI15m ≤ 30", rsi_15m is not None and rsi_15m <= 30, rsi_15m),
                ("MACD 골든크로스", macd_golden, f"prev {prev_hist} → cur {macd_hist_15m}"),
                ("거래량비율 ≥ 1.5", vol_ratio is not None and vol_ratio >= 1.5, vol_ratio),
            ],
        },
        {
            "rule": "적극 매도",
            "signal": "sell_strong",
            "checks": [
                ("RSI15m ≥ 70", rsi_15m is not None and rsi_15m >= 70, rsi_15m),
                ("MACD 데드크로스", macd_dead, f"prev {prev_hist} → cur {macd_hist_15m}"),
            ],
        },
        {
            "rule": "매수 고려",
            "signal": "buy",
            "checks": [
                ("RSI15m ≤ 40", rsi_15m is not None and rsi_15m <= 40, rsi_15m),
                ("볼린저 하단 근접", near_bb_lower, f"price {price} / lower {bb_lower}"),
                ("추세=상승", trend == "상승", trend),
            ],
        },
        {
            "rule": "매도 고려",
            "signal": "sell",
            "checks": [
                ("RSI15m ≥ 65", rsi_15m is not None and rsi_15m >= 65, rsi_15m),
                ("볼린저 상단 근접", near_bb_upper, f"price {price} / upper {bb_upper}"),
                ("추세=하락", trend == "하락", trend),
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
        "trend": trend,
        "rsi": {"15m": rsi_15m, "1h": rsi_1h, "1d": rsi_1d},
        "macd_hist_15m": macd_hist_15m,
        "macd_hist_1h": macd_hist_1h,
        "macd_prev_hist_15m": prev_hist,
        "volume_ratio_15m": vol_ratio,
        "bb_15m": {"upper": bb_upper, "lower": bb_lower},
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
    """신호 → 매매 주문 변환."""
    actions = []
    cash = state.get("cash", 0)
    max_pct = CONFIG["safety"]["max_single_trade_pct"]

    for market, pc in per_coin_map.items():
        sig = pc["signal"]
        note = _short_note(pc)
        if sig == "buy_strong":
            amt = int(cash * max_pct)
            if amt > 0:
                actions.append({
                    "action": "buy", "market": market, "amount_krw": amt,
                    "reason": f"[ALGO] 적극매수 - {note}",
                })
        elif sig == "buy":
            amt = int(cash * 0.10)
            if amt > 0:
                actions.append({
                    "action": "buy", "market": market, "amount_krw": amt,
                    "reason": f"[ALGO] 소량매수 - {note}",
                })
        elif sig == "sell_strong":
            actions.append({
                "action": "sell", "market": market, "sell_pct": 1.0,
                "reason": f"[ALGO] 적극매도 - {note}",
            })
        elif sig == "sell":
            actions.append({
                "action": "sell", "market": market, "sell_pct": 0.5,
                "reason": f"[ALGO] 부분매도 - {note}",
            })
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
