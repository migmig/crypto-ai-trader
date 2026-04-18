#!/usr/bin/env python3
"""AI 암호화폐 트레이더 - 웹 대시보드"""

import json
import csv
import os
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template, jsonify, send_from_directory

BASE_DIR = Path(__file__).parent
DIST_DIR = BASE_DIR / "static" / "dist"
app = Flask(__name__, static_folder=str(DIST_DIR / "assets"), static_url_path="/assets")

pyupbit = None

def _get_pyupbit():
    global pyupbit
    if pyupbit is None:
        try:
            import pyupbit as _pu
            pyupbit = _pu
        except ImportError:
            pass
    return pyupbit


def load_json(filename):
    path = BASE_DIR / filename
    if path.exists():
        return json.loads(path.read_text())
    return None


def load_csv(filename):
    path = BASE_DIR / filename
    if not path.exists():
        return []
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def get_current_prices(markets):
    """현재가 조회 (pyupbit 또는 latest.json fallback)"""
    prices = {}
    pu = _get_pyupbit()
    try:
        if pu:
            for m in markets:
                p = pu.get_current_price(m)
                if p:
                    prices[m] = p
            if prices:
                return prices
    except Exception:
        pass
    # fallback
    data = load_json("market_data/latest.json")
    if data:
        for m in markets:
            mdata = data.get("markets", {}).get(m, {})
            ticker = mdata.get("ticker", {})
            if "trade_price" in ticker:
                prices[m] = ticker["trade_price"]
    return prices


@app.route("/")
@app.route("/history")
def index():
    return send_from_directory(str(DIST_DIR), "index.html")


@app.route("/favicon.svg")
def favicon():
    return send_from_directory(str(DIST_DIR), "favicon.svg", mimetype="image/svg+xml")


@app.route("/api/status")
def api_status():
    state = load_json("state.json") or {}
    config = load_json("config.json") or {}
    action = load_json("action.json") or {}
    data = load_json("market_data/latest.json") or {}

    # 현재가 조회
    holdings = state.get("holdings", {})
    markets = list(holdings.keys())
    all_markets = config.get("markets", [])
    prices = get_current_prices(all_markets)

    # 보유 코인 평가
    holdings_detail = []
    holdings_value = 0
    for market, h in holdings.items():
        if h.get("qty", 0) <= 0:
            continue
        current_price = prices.get(market, h.get("avg_price", 0))
        value = h["qty"] * current_price
        cost = h["qty"] * h.get("avg_price", 0)
        pl = value - cost
        pl_pct = (pl / cost * 100) if cost > 0 else 0
        holdings_value += value
        holdings_detail.append({
            "market": market,
            "coin": market.replace("KRW-", ""),
            "qty": h["qty"],
            "avg_price": h.get("avg_price", 0),
            "current_price": current_price,
            "value": round(value),
            "cost": round(cost),
            "pl": round(pl),
            "pl_pct": round(pl_pct, 2),
            "bought_at": h.get("bought_at", ""),
        })

    cash = state.get("cash", 0)
    total = cash + holdings_value
    initial = state.get("initial_capital", 10000000)
    total_pl = total - initial
    total_pl_pct = (total_pl / initial * 100) if initial > 0 else 0

    # 지금 즉시 전량 매도 시 순수령액 (현금 + 보유 평가 × (1 - 수수료율))
    fee_rate = float(config.get("fee_rate", 0.0005))
    liquidation_fee = holdings_value * fee_rate
    liquidation_value = cash + holdings_value - liquidation_fee
    liquidation_pl = liquidation_value - initial
    liquidation_pl_pct = (liquidation_pl / initial * 100) if initial > 0 else 0

    # 누적 수수료/거래량 집계 (trade_log.csv)
    all_trades = load_csv("trade_log.csv")
    total_fee = 0.0
    total_volume = 0.0
    buy_count = 0
    sell_count = 0
    for t in all_trades:
        try:
            total_fee += float(t.get("fee", 0) or 0)
            total_volume += float(t.get("amount_krw", 0) or 0)
            if t.get("action") == "buy":
                buy_count += 1
            elif t.get("action") == "sell":
                sell_count += 1
        except Exception:
            continue
    fee_pct = (total_fee / total_volume * 100) if total_volume > 0 else 0
    # 수수료가 손익에서 차지하는 비중 (손실 시에는 별 의미 없지만 정보성)
    fee_vs_initial_pct = (total_fee / initial * 100) if initial > 0 else 0

    # 시장 데이터 요약
    market_summary = []
    for m in all_markets:
        mdata = data.get("markets", {}).get(m, {})
        ticker = mdata.get("ticker", {})
        ind = mdata.get("indicators", {})
        market_summary.append({
            "market": m,
            "coin": m.replace("KRW-", ""),
            "price": prices.get(m, ticker.get("trade_price", 0)),
            "change_rate": ticker.get("signed_change_rate", 0),
            "volume_24h": ticker.get("acc_trade_price_24h", 0),
            "rsi_15m": ind.get("rsi_15m"),
            "rsi_1h": ind.get("rsi_1h"),
            "macd_hist": (ind.get("macd_15m") or {}).get("histogram"),
            "trend": ind.get("trend", "-"),
            "volume_ratio": ind.get("volume_ratio_15m"),
        })

    return jsonify({
        "cash": cash,
        "holdings_value": round(holdings_value),
        "total": round(total),
        "initial_capital": initial,
        "total_pl": round(total_pl),
        "total_pl_pct": round(total_pl_pct, 2),
        "liquidation_value": round(liquidation_value),
        "liquidation_pl": round(liquidation_pl),
        "liquidation_pl_pct": round(liquidation_pl_pct, 2),
        "liquidation_fee": round(liquidation_fee),
        "total_fee": round(total_fee),
        "total_volume": round(total_volume),
        "fee_pct": round(fee_pct, 3),
        "fee_vs_initial_pct": round(fee_vs_initial_pct, 2),
        "total_buy_count": buy_count,
        "total_sell_count": sell_count,
        "holdings": holdings_detail,
        "markets": market_summary,
        "total_trades_today": state.get("total_trades_today", 0),
        "last_trade_time": state.get("last_trade_time"),
        "last_action": {
            "source": action.get("source", ""),
            "market_summary": action.get("market_summary", ""),
            "risk_assessment": action.get("risk_assessment", ""),
            "actions": action.get("actions", []),
            "per_coin": action.get("per_coin", {}),
            "conditions_checked": action.get("conditions_checked", []),
            "triggers_next_cycle": action.get("triggers_next_cycle", []),
            "timestamp": action.get("timestamp", ""),
        },
        "collected_at": data.get("collected_at", ""),
        "analyzed_at": data.get("analyzed_at", ""),
    })


@app.route("/api/trades")
def api_trades():
    trades = load_csv("trade_log.csv")
    return jsonify(trades[-100:][::-1])  # 최근 100건, 최신순


@app.route("/api/performance")
def api_performance():
    perf = load_csv("performance.csv")
    return jsonify(perf[-500:])  # 최근 500건


@app.route("/api/judgments")
def api_judgments():
    """AI 판단 히스토리. SQLite 기반.
    쿼리 파라미터:
      offset, limit — 페이지네이션
      source — 'ai' | 'algo' (선택)
      filter — 'has_action' | 'hold_only' (선택)
      since, until — ISO timestamp 범위 (선택)
    """
    from flask import request
    from history_db import query_judgments
    offset = max(0, int(request.args.get("offset", 0)))
    limit = min(500, max(1, int(request.args.get("limit", 50))))
    source = request.args.get("source")
    f = request.args.get("filter")
    since = request.args.get("since")
    until = request.args.get("until")

    result = query_judgments(
        offset=offset,
        limit=limit,
        source=source if source in ("ai", "algo") else None,
        actions_only=(f == "has_action"),
        hold_only=(f == "hold_only"),
        since=since,
        until=until,
    )
    return jsonify(result)


@app.route("/api/judgments/stats")
def api_judgments_stats():
    """히스토리 전역 통계 (전체 수, AI/ALGO 분포, 액션 발생 수, 기간)."""
    from history_db import stats
    return jsonify(stats())


@app.route("/api/logs")
def api_logs():
    """사이클 로그 조회 (cron.log + 압축 아카이브)"""
    import gzip as gz
    logs_dir = BASE_DIR / "logs"
    lines = []

    # 1) 현재 cron.log
    current = logs_dir / "cron.log"
    if current.exists():
        try:
            lines.extend(current.read_text(errors="replace").splitlines())
        except Exception:
            pass

    # 2) gz 아카이브 (최근 3개)
    if len(lines) < 2000:
        archives = sorted(logs_dir.glob("cron_*.log.gz"), reverse=True)[:3]
        for arc in archives:
            try:
                with gz.open(arc, "rt", errors="replace") as f:
                    lines = f.read().splitlines() + lines
            except Exception:
                continue

    # 사이클 단위로 파싱
    cycles = []
    current_cycle = None
    for line in lines:
        if "사이클 시작:" in line:
            current_cycle = {"lines": [line], "timestamp": "", "status": "running"}
            # "AI 트레이더 사이클 시작: 2026-04-17 21:09:00"
            parts = line.split("사이클 시작:")
            if len(parts) > 1:
                current_cycle["timestamp"] = parts[1].strip()
        elif current_cycle is not None:
            current_cycle["lines"].append(line)
            if "사이클 완료:" in line:
                current_cycle["status"] = "ok"
                cycles.append(current_cycle)
                current_cycle = None
            elif "[ERROR]" in line or "Traceback" in line:
                current_cycle["status"] = "error"

    if current_cycle:
        cycles.append(current_cycle)

    # 최신순 200개, 각 사이클 본문은 결합
    cycles.reverse()
    result = []
    for c in cycles[:200]:
        # 요약 추출
        has_ai = any("Step 4: AI" in l for l in c["lines"])
        has_action = any("[SIM 매수]" in l or "[SIM 매도]" in l for l in c["lines"])
        has_hold = any("관망" in l for l in c["lines"])
        has_trailing = any("트레일링 손절" in l for l in c["lines"])
        has_stop = any("전체 손절" in l or "손절" in l for l in c["lines"] if "트레일링" not in l)

        tags = []
        if has_ai: tags.append("AI")
        if has_action: tags.append("TRADE")
        if has_trailing: tags.append("TRAILING")
        if has_stop: tags.append("STOPLOSS")
        if has_hold and not has_action: tags.append("HOLD")

        result.append({
            "timestamp": c["timestamp"],
            "status": c["status"],
            "tags": tags,
            "body": "\n".join(c["lines"]),
            "line_count": len(c["lines"]),
        })

    return jsonify(result)


@app.route("/logs")
@app.route("/charts")
def spa_fallback():
    return send_from_directory(str(DIST_DIR), "index.html")


@app.route("/api/chart/coin/<market>")
def api_chart_coin(market):
    """코인별 차트: pyupbit 캔들 + 우리 매매 내역 오버레이.
    ?interval=minute15|minute30|minute60|minute240|day (default minute60)
    &count=200 (default)
    """
    from flask import request
    interval = request.args.get("interval", "minute60")
    if interval not in ("minute15", "minute30", "minute60", "minute240", "day"):
        interval = "minute60"
    try:
        count = min(500, max(10, int(request.args.get("count", 200))))
    except ValueError:
        count = 200

    pu = _get_pyupbit()
    candles = []
    if pu:
        try:
            df = pu.get_ohlcv(market, interval=interval, count=count)
            if df is not None:
                for ts, row in df.iterrows():
                    candles.append({
                        "t": ts.isoformat(),
                        "o": float(row["open"]),
                        "h": float(row["high"]),
                        "l": float(row["low"]),
                        "c": float(row["close"]),
                        "v": float(row["volume"]),
                    })
        except Exception as e:
            return jsonify({"error": str(e), "candles": [], "trades": []}), 500

    # 매매 내역 오버레이 (해당 코인, 캔들 범위 내)
    trades = []
    if candles:
        since = candles[0]["t"]
        trade_rows = load_csv("trade_log.csv")
        for t in trade_rows:
            if t.get("market") != market:
                continue
            if t.get("timestamp", "") < since:
                continue
            try:
                trades.append({
                    "t": t["timestamp"],
                    "action": t.get("action", ""),
                    "price": float(t.get("price", 0)),
                    "qty": float(t.get("qty", 0)),
                    "amount": float(t.get("amount_krw", 0)),
                })
            except Exception:
                continue

    return jsonify({
        "market": market,
        "interval": interval,
        "candles": candles,
        "trades": trades,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=False)
