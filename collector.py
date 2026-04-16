#!/usr/bin/env python3
"""시장 데이터 수집기 - 업비트 공개 API"""

import json
import time
import os
from datetime import datetime
from pathlib import Path

try:
    import pyupbit
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyupbit", "--break-system-packages", "-q"])
    import pyupbit

BASE_DIR = Path(__file__).parent
CONFIG = json.loads((BASE_DIR / "config.json").read_text())
MARKETS = CONFIG["markets"]
OUT_DIR = BASE_DIR / "market_data"
OUT_DIR.mkdir(exist_ok=True)


def fetch_ticker(markets):
    """현재가 정보"""
    try:
        data = pyupbit.get_current_price(markets, verbose=True)
        if isinstance(data, dict):
            # 단일 마켓인 경우
            return {markets[0]: data}
        result = {}
        for item in data:
            result[item["market"]] = {
                "market": item["market"],
                "trade_price": item["trade_price"],
                "opening_price": item["opening_price"],
                "high_price": item["high_price"],
                "low_price": item["low_price"],
                "prev_closing_price": item["prev_closing_price"],
                "signed_change_rate": item["signed_change_rate"],
                "acc_trade_volume_24h": item["acc_trade_volume_24h"],
                "acc_trade_price_24h": item["acc_trade_price_24h"],
            }
        return result
    except Exception as e:
        print(f"[ERROR] ticker 수집 실패: {e}")
        return {}


def fetch_candles(market, interval="minute15", count=100):
    """캔들 데이터"""
    try:
        df = pyupbit.get_ohlcv(market, interval=interval, count=count)
        if df is None or df.empty:
            return []
        records = []
        for idx, row in df.iterrows():
            records.append({
                "timestamp": idx.isoformat(),
                "open": row["open"],
                "high": row["high"],
                "low": row["low"],
                "close": row["close"],
                "volume": row["volume"],
            })
        return records
    except Exception as e:
        print(f"[ERROR] candle 수집 실패 ({market}): {e}")
        return []


def fetch_orderbook(market):
    """호가 정보"""
    try:
        ob = pyupbit.get_orderbook(market)
        if not ob:
            return {}
        units = ob["orderbook_units"][:5]  # 상위 5호가
        return {
            "ask_total": sum(u["ask_size"] for u in units),
            "bid_total": sum(u["bid_size"] for u in units),
            "spread": units[0]["ask_price"] - units[0]["bid_price"],
            "spread_pct": (units[0]["ask_price"] - units[0]["bid_price"]) / units[0]["bid_price"],
            "top_ask": units[0]["ask_price"],
            "top_bid": units[0]["bid_price"],
        }
    except Exception as e:
        print(f"[ERROR] orderbook 수집 실패 ({market}): {e}")
        return {}


def collect_all():
    now = datetime.now().isoformat()
    result = {
        "collected_at": now,
        "markets": {}
    }

    # 현재가
    tickers = fetch_ticker(MARKETS)
    time.sleep(0.2)

    for market in MARKETS:
        print(f"  수집 중: {market}")
        entry = {"ticker": tickers.get(market, {})}

        # 15분봉 캔들 (100개)
        entry["candles_15m"] = fetch_candles(market, "minute15", 100)
        time.sleep(0.1)

        # 1시간봉 캔들 (48개)
        entry["candles_1h"] = fetch_candles(market, "minute60", 48)
        time.sleep(0.1)

        # 일봉 (30일)
        entry["candles_1d"] = fetch_candles(market, "day", 30)
        time.sleep(0.1)

        # 호가
        entry["orderbook"] = fetch_orderbook(market)
        time.sleep(0.1)

        result["markets"][market] = entry

    # 저장
    out_path = OUT_DIR / "latest.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"[OK] 데이터 수집 완료 → {out_path}")
    return result


if __name__ == "__main__":
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 데이터 수집 시작...")
    collect_all()
