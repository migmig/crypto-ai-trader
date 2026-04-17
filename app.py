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
    """AI 판단 히스토리 (action_history/ — JSON + tar.gz 아카이브)"""
    import tarfile, io
    history_dir = BASE_DIR / "action_history"
    if not history_dir.exists():
        return jsonify([])

    results = []

    def _parse(data):
        return {
            "timestamp": data.get("timestamp", ""),
            "source": data.get("source", ""),
            "actions": data.get("actions", []),
            "market_summary": data.get("market_summary", ""),
            "risk_assessment": data.get("risk_assessment", ""),
            "per_coin": data.get("per_coin", {}),
            "conditions_checked": data.get("conditions_checked", []),
            "triggers_next_cycle": data.get("triggers_next_cycle", []),
        }

    # 1) 개별 JSON (최신 — 아직 압축 안 된 것)
    for f in sorted(history_dir.glob("action_*.json"), reverse=True)[:50]:
        try:
            results.append(_parse(json.loads(f.read_text())))
        except Exception:
            continue

    # 2) tar.gz 아카이브 (일별 압축분, 최근 3일치만)
    if len(results) < 50:
        remain = 50 - len(results)
        archives = sorted(history_dir.glob("archive_*.tar.gz"), reverse=True)[:3]
        for arc in archives:
            try:
                with tarfile.open(arc, "r:gz") as tf:
                    members = sorted(tf.getnames(), reverse=True)
                    for name in members[:remain]:
                        data = json.loads(tf.extractfile(name).read())
                        results.append(_parse(data))
                        remain -= 1
                        if remain <= 0:
                            break
            except Exception:
                continue
            if remain <= 0:
                break

    return jsonify(results)


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
def logs_page():
    return send_from_directory(str(DIST_DIR), "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=False)
