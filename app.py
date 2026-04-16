#!/usr/bin/env python3
"""AI 암호화폐 트레이더 - 웹 대시보드"""

import json
import csv
import os
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template, jsonify

BASE_DIR = Path(__file__).parent
app = Flask(__name__)

try:
    import pyupbit
except ImportError:
    pyupbit = None


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
    try:
        if pyupbit:
            for m in markets:
                p = pyupbit.get_current_price(m)
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
def index():
    return render_template("dashboard.html")


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
            "market_summary": action.get("market_summary", ""),
            "risk_assessment": action.get("risk_assessment", ""),
            "actions": action.get("actions", []),
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=False)
