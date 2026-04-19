#!/usr/bin/env python3
"""매매 실행기 - action.json을 읽고 시뮬레이션/실전 매매 실행"""

import json
import csv
import os
from datetime import datetime, timedelta
from pathlib import Path

try:
    import pyupbit
except ImportError:
    pass

BASE_DIR = Path(__file__).parent
CONFIG = json.loads((BASE_DIR / "config.json").read_text())

# ═══ 모드 설정 ═══
LIVE_MODE = False  # True로 바꾸면 실제 주문 나감!
UPBIT_ACCESS_KEY = os.environ.get("UPBIT_ACCESS_KEY", "")
UPBIT_SECRET_KEY = os.environ.get("UPBIT_SECRET_KEY", "")


def load_state():
    path = BASE_DIR / "state.json"
    if path.exists():
        return json.loads(path.read_text())
    return {
        "initial_capital": CONFIG["initial_capital"],
        "cash": CONFIG["initial_capital"],
        "holdings": {},
        "total_trades_today": 0,
        "last_trade_time": None,
        "today_date": None,
        "created_at": datetime.now().isoformat(),
    }


def save_state(state):
    (BASE_DIR / "state.json").write_text(json.dumps(state, ensure_ascii=False, indent=2))
    # Supabase dual-write
    try:
        import db as _pg
        if _pg.enabled():
            from datetime import datetime as _dt
            ltt = state.get("last_trade_time")
            _pg.upsert_state(
                initial_capital=state.get("initial_capital", 10_000_000),
                cash=state.get("cash", 0),
                holdings=state.get("holdings", {}),
                total_trades_today=state.get("total_trades_today", 0),
                last_trade_time=_dt.fromisoformat(ltt) if ltt else None,
                today_date=state.get("today_date"),
            )
    except Exception:
        pass


def load_action():
    path = BASE_DIR / "action.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def get_current_price(market):
    """현재가 조회"""
    try:
        return pyupbit.get_current_price(market)
    except:
        # latest.json에서 가져오기 (fallback)
        data_path = BASE_DIR / "market_data" / "latest.json"
        if data_path.exists():
            data = json.loads(data_path.read_text())
            mdata = data.get("markets", {}).get(market, {})
            ticker = mdata.get("ticker", {})
            return ticker.get("trade_price")
    return None


def log_trade(action, market, qty, price, amount, reason, result):
    """거래 로그 기록. CSV + Supabase dual-write."""
    log_path = BASE_DIR / "trade_log.csv"
    is_new = not log_path.exists()
    fee = amount * CONFIG['fee_rate']
    ts = datetime.now()
    with open(log_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(["timestamp", "action", "market", "qty", "price", "amount_krw", "fee", "reason", "result", "cash_after"])
        writer.writerow([
            ts.isoformat(),
            action, market,
            f"{qty:.8f}", f"{price:.0f}", f"{amount:.0f}",
            f"{fee:.0f}",
            reason, result, ""
        ])
    # Supabase (실패해도 CSV는 유지)
    try:
        import db as _pg
        if _pg.enabled():
            _pg.insert_trade(
                action=action, market=market,
                qty=qty, price=price, amount_krw=amount, fee=fee,
                reason=reason, result=result, ts=ts,
            )
    except Exception:
        pass


def log_performance(state):
    """일별 성과 기록"""
    perf_path = BASE_DIR / "performance.csv"
    is_new = not perf_path.exists()

    # 총 평가금액 계산
    total = state["cash"]
    for market, h in state["holdings"].items():
        price = get_current_price(market) or h.get("avg_price", 0)
        total += h["qty"] * price

    pl = total - state["initial_capital"]
    pl_pct = pl / state["initial_capital"] if state["initial_capital"] > 0 else 0

    ts = datetime.now()
    num_holdings = len([h for h in state["holdings"].values() if h["qty"] > 0])
    with open(perf_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(["timestamp", "cash", "holdings_value", "total_value", "pl_krw", "pl_pct", "num_holdings"])
        writer.writerow([
            ts.isoformat(),
            f"{state['cash']:.0f}",
            f"{total - state['cash']:.0f}",
            f"{total:.0f}",
            f"{pl:.0f}",
            f"{pl_pct:.4f}",
            num_holdings,
        ])
    # Supabase dual-write
    try:
        import db as _pg
        if _pg.enabled():
            _pg.insert_performance(
                ts=ts, cash=state["cash"],
                holdings_value=total - state["cash"],
                total_value=total, pl_krw=pl, pl_pct=pl_pct,
                num_holdings=num_holdings,
            )
    except Exception:
        pass


def check_safety(state, action_item):
    """안전장치 검증"""
    safety = CONFIG["safety"]
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")

    # 일일 거래횟수 리셋
    if state.get("today_date") != today:
        state["total_trades_today"] = 0
        state["today_date"] = today

    # 일일 최대 거래횟수
    if state["total_trades_today"] >= safety["max_trades_per_day"]:
        return False, "일일 최대 거래횟수 초과"

    # 최소 홀딩 시간
    if state.get("last_trade_time"):
        last = datetime.fromisoformat(state["last_trade_time"])
        if (now - last).total_seconds() < safety["min_hold_minutes"] * 60:
            return False, f"최소 홀딩 시간 {safety['min_hold_minutes']}분 미충족"

    if action_item["action"] == "buy":
        amount = action_item["amount_krw"]

        # 보유 현금 초과
        if amount > state["cash"]:
            return False, f"현금 부족 (보유: {state['cash']:,.0f}, 필요: {amount:,.0f})"

        # 1회 최대 매매금액
        max_amount = state["cash"] * safety["max_single_trade_pct"]
        if amount > max_amount:
            return False, f"1회 최대 금액 초과 ({amount:,.0f} > {max_amount:,.0f})"

    return True, "OK"


def check_stop_loss(state):
    """전체 손절 체크"""
    total = state["cash"]
    for market, h in state["holdings"].items():
        price = get_current_price(market) or h.get("avg_price", 0)
        total += h["qty"] * price

    pl_pct = (total - state["initial_capital"]) / state["initial_capital"]
    if pl_pct <= CONFIG["safety"]["max_loss_pct"]:
        return True, pl_pct
    return False, pl_pct


def check_trailing_stops(state):
    """포지션별 트레일링 손절 (-7% from peak).
    각 보유 코인의 peak_price를 갱신하고, 현재가가 peak에서 trailing_stop_pct 이상
    하락했으면 해당 포지션만 매도 대상으로 반환."""
    trail_pct = CONFIG["safety"].get("trailing_stop_pct", -0.07)
    to_sell = []
    for market, h in state["holdings"].items():
        if h.get("qty", 0) <= 0:
            continue
        price = get_current_price(market)
        if not price:
            continue
        avg = h.get("avg_price", price)
        # 수익 구간에서만 트레일링 활성화 (손실 구간은 -15% 전체 백스톱에 의존)
        if price <= avg:
            h["peak_price"] = avg  # peak 리셋
            continue
        # peak_price 갱신
        peak = h.get("peak_price", avg)
        if price > peak:
            peak = price
        h["peak_price"] = peak
        # 고점 대비 하락폭 판단
        drop = (price - peak) / peak if peak > 0 else 0
        if drop <= trail_pct:
            to_sell.append((market, price, peak, drop))
    return to_sell


def execute_buy_sim(state, market, amount_krw, reason):
    """시뮬레이션 매수"""
    price = get_current_price(market)
    if not price:
        return state, "가격 조회 실패"

    fee = amount_krw * CONFIG["fee_rate"]
    actual_amount = amount_krw - fee
    qty = actual_amount / price

    # 기존 보유 있으면 평균단가 계산
    prev = state["holdings"].get(market, {"qty": 0, "avg_price": 0})
    total_qty = prev["qty"] + qty
    if total_qty > 0:
        avg_price = (prev["qty"] * prev["avg_price"] + qty * price) / total_qty
    else:
        avg_price = price

    prev_peak = prev.get("peak_price", 0)
    state["holdings"][market] = {
        "qty": total_qty,
        "avg_price": round(avg_price, 2),
        "bought_at": datetime.now().isoformat(),
        "peak_price": max(price, prev_peak),
    }
    state["cash"] -= amount_krw
    state["total_trades_today"] += 1
    state["last_trade_time"] = datetime.now().isoformat()

    log_trade("buy", market, qty, price, amount_krw, reason, "SIM_OK")
    print(f"  [SIM 매수] {market} | {qty:.6f}개 × ₩{price:,.0f} = ₩{amount_krw:,.0f} (수수료 ₩{fee:,.0f})")
    return state, "OK"


def execute_sell_sim(state, market, reason, sell_pct=1.0):
    """시뮬레이션 매도"""
    h = state["holdings"].get(market)
    if not h or h["qty"] <= 0:
        return state, "보유 수량 없음"

    price = get_current_price(market)
    if not price:
        return state, "가격 조회 실패"

    sell_qty = h["qty"] * sell_pct
    gross = sell_qty * price
    fee = gross * CONFIG["fee_rate"]
    net = gross - fee

    # 수익률 계산
    cost = sell_qty * h["avg_price"]
    pl = net - cost
    pl_pct = (pl / cost * 100) if cost > 0 else 0

    remaining_qty = h["qty"] - sell_qty
    if remaining_qty < 0.00000001:
        remaining_qty = 0

    state["holdings"][market] = {
        "qty": remaining_qty,
        "avg_price": h["avg_price"] if remaining_qty > 0 else 0,
        "bought_at": h.get("bought_at"),
    }
    state["cash"] += net
    state["total_trades_today"] += 1
    state["last_trade_time"] = datetime.now().isoformat()

    log_trade("sell", market, sell_qty, price, gross, reason, f"SIM_OK (PL: {pl:+,.0f}, {pl_pct:+.2f}%)")
    print(f"  [SIM 매도] {market} | {sell_qty:.6f}개 × ₩{price:,.0f} = ₩{gross:,.0f} (수익: {pl:+,.0f}, {pl_pct:+.2f}%)")
    return state, "OK"


def _compress_old_actions(archive_dir):
    """오늘 이전 JSON을 일별 tar.gz로 압축 후 삭제."""
    import tarfile
    today = datetime.now().strftime("%Y%m%d")
    by_day = {}
    for f in archive_dir.glob("action_*.json"):
        day = f.name[7:15]  # action_YYYYMMDD_HHMMSS.json
        if day < today:
            by_day.setdefault(day, []).append(f)
    for day, files in by_day.items():
        arc = archive_dir / f"archive_{day}.tar.gz"
        if arc.exists():
            continue
        with tarfile.open(arc, "w:gz") as tf:
            for f in sorted(files):
                tf.add(f, arcname=f.name)
        for f in files:
            f.unlink()


def execute():
    state = load_state()
    action_data = load_action()

    if not action_data:
        print("[INFO] action.json 없음. 스킵.")
        return

    print(f"\n{'='*50}")
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 매매 실행 시작")
    print(f"  모드: {'🔴 실전' if LIVE_MODE else '🟢 시뮬레이션'}")
    print(f"  보유 현금: ₩{state['cash']:,.0f}")
    print(f"{'='*50}")

    if action_data.get("market_summary"):
        print(f"\n📊 시장 요약: {action_data['market_summary']}")
    if action_data.get("risk_assessment"):
        print(f"⚠️  리스크: {action_data['risk_assessment']}")

    # 포지션별 트레일링 손절 (-7% from peak)
    trailing_sells = check_trailing_stops(state)
    for market, price, peak, drop in trailing_sells:
        print(f"\n🔻 [트레일링 손절] {market} | 고점 ₩{peak:,.0f} → 현재 ₩{price:,.0f} ({drop:.2%})")
        state, _ = execute_sell_sim(
            state, market,
            f"트레일링 손절 (고점 ₩{peak:,.0f} → ₩{price:,.0f}, {drop:.2%})"
        )

    # 전체 포트폴리오 손절 (-15% 백스톱)
    need_stop, current_pl = check_stop_loss(state)
    if need_stop:
        print(f"\n🚨 [전체 손절] 총 수익률 {current_pl:.2%} → 전량 매도!")
        for market in list(state["holdings"].keys()):
            if state["holdings"][market]["qty"] > 0:
                state, _ = execute_sell_sim(state, market, f"전체 손절 (총 {current_pl:.2%})")
        save_state(state)
        log_performance(state)
        return

    # action.json 아카이브 (관망 포함)
    archive_dir = BASE_DIR / "action_history"
    archive_dir.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    (archive_dir / f"action_{ts}.json").write_text(
        json.dumps(action_data, ensure_ascii=False, indent=2)
    )

    # SQLite 히스토리에도 저장 (실패해도 사이클 진행)
    try:
        from history_db import insert_judgment
        insert_judgment(action_data)
    except Exception as e:
        print(f"  [WARN] history_db 저장 실패: {e}")

    # 전날 이전 JSON 자동 압축
    _compress_old_actions(archive_dir)

    actions = action_data.get("actions", [])
    if not actions:
        print("\n😐 관망 - 매매 없음")
        save_state(state)
        log_performance(state)
        return

    for item in actions:
        action = item["action"]
        market = item["market"]
        reason = item.get("reason", "")

        # 안전장치 검증
        ok, msg = check_safety(state, item)
        if not ok:
            print(f"\n  ⛔ [{market}] 안전장치: {msg}")
            continue

        if action == "buy":
            amount = item.get("amount_krw", 0)
            if LIVE_MODE:
                print(f"  🔴 [실전 매수] {market} ₩{amount:,.0f} — 미구현 (pyupbit.Upbit 필요)")
            else:
                state, result = execute_buy_sim(state, market, amount, reason)

        elif action == "sell":
            sell_pct = item.get("sell_pct", 1.0)
            if LIVE_MODE:
                print(f"  🔴 [실전 매도] {market} — 미구현")
            else:
                state, result = execute_sell_sim(state, market, reason, sell_pct)

    # 현재 총 평가
    total = state["cash"]
    for m, h in state["holdings"].items():
        p = get_current_price(m) or h.get("avg_price", 0)
        total += h["qty"] * p
    pl = total - state["initial_capital"]
    pl_pct = pl / state["initial_capital"]

    print(f"\n{'─'*50}")
    print(f"  💰 현금: ₩{state['cash']:,.0f}")
    print(f"  📈 총 평가: ₩{total:,.0f} ({pl:+,.0f}, {pl_pct:+.2%})")
    print(f"  📊 오늘 거래: {state['total_trades_today']}회")
    print(f"{'─'*50}\n")

    save_state(state)
    log_performance(state)


if __name__ == "__main__":
    execute()
