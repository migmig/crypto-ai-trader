#!/usr/bin/env python3
"""기술지표 계산기 - 캔들 데이터에 RSI, MACD, BB, MA 추가"""

import json
import math
from pathlib import Path

BASE_DIR = Path(__file__).parent
CONFIG = json.loads((BASE_DIR / "config.json").read_text())


def calc_rsi(closes, period=14):
    """RSI 계산"""
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))

    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def calc_ema(data, period):
    """지수이동평균"""
    if len(data) < period:
        return []
    k = 2 / (period + 1)
    ema = [sum(data[:period]) / period]
    for price in data[period:]:
        ema.append(price * k + ema[-1] * (1 - k))
    return ema


def calc_macd(closes, fast=12, slow=26, signal=9):
    """MACD, Signal, Histogram"""
    if len(closes) < slow + signal:
        return None, None, None
    ema_fast = calc_ema(closes, fast)
    ema_slow = calc_ema(closes, slow)
    # 길이 맞추기
    offset = len(ema_fast) - len(ema_slow)
    macd_line = [f - s for f, s in zip(ema_fast[offset:], ema_slow)]
    if len(macd_line) < signal:
        return None, None, None
    signal_line = calc_ema(macd_line, signal)
    offset2 = len(macd_line) - len(signal_line)
    histogram = macd_line[-1] - signal_line[-1] if signal_line else None
    return (
        round(macd_line[-1], 2) if macd_line else None,
        round(signal_line[-1], 2) if signal_line else None,
        round(histogram, 2) if histogram is not None else None,
    )


def calc_bollinger(closes, period=20, std_mult=2):
    """볼린저밴드 (upper, middle, lower)"""
    if len(closes) < period:
        return None, None, None
    window = closes[-period:]
    middle = sum(window) / period
    variance = sum((x - middle) ** 2 for x in window) / period
    std = math.sqrt(variance)
    return (
        round(middle + std_mult * std, 2),
        round(middle, 2),
        round(middle - std_mult * std, 2),
    )


def calc_ma(closes, period):
    """단순이동평균"""
    if len(closes) < period:
        return None
    return round(sum(closes[-period:]) / period, 2)


def calc_atr(candles, period=14):
    """ATR (Average True Range)"""
    if len(candles) < period + 1:
        return None
    trs = []
    for i in range(1, len(candles)):
        h = candles[i]["high"]
        l = candles[i]["low"]
        pc = candles[i - 1]["close"]
        tr = max(h - l, abs(h - pc), abs(l - pc))
        trs.append(tr)
    return round(sum(trs[-period:]) / period, 2)


def calc_volume_ratio(candles, period=20):
    """현재 거래량 / 평균 거래량"""
    if len(candles) < period + 1:
        return None
    avg_vol = sum(c["volume"] for c in candles[-(period + 1):-1]) / period
    current_vol = candles[-1]["volume"]
    if avg_vol == 0:
        return None
    return round(current_vol / avg_vol, 2)


def analyze_market(market_data):
    """단일 마켓 기술지표 계산"""
    indicators = {}

    # 15분봉 기준 단기 지표
    candles_15m = market_data.get("candles_15m", [])
    if candles_15m:
        closes = [c["close"] for c in candles_15m]
        indicators["rsi_15m"] = calc_rsi(closes, CONFIG["indicators"]["rsi_period"])

        macd, signal, hist = calc_macd(
            closes,
            CONFIG["indicators"]["macd_fast"],
            CONFIG["indicators"]["macd_slow"],
            CONFIG["indicators"]["macd_signal"],
        )
        indicators["macd_15m"] = {"macd": macd, "signal": signal, "histogram": hist}

        bb_upper, bb_mid, bb_lower = calc_bollinger(
            closes, CONFIG["indicators"]["bb_period"], CONFIG["indicators"]["bb_std"]
        )
        indicators["bollinger_15m"] = {"upper": bb_upper, "middle": bb_mid, "lower": bb_lower}

        for p in CONFIG["indicators"]["ma_periods"]:
            indicators[f"ma{p}_15m"] = calc_ma(closes, p)

        indicators["atr_15m"] = calc_atr(candles_15m)
        indicators["volume_ratio_15m"] = calc_volume_ratio(candles_15m)

    # 1시간봉 기준 중기 지표
    candles_1h = market_data.get("candles_1h", [])
    if candles_1h:
        closes_1h = [c["close"] for c in candles_1h]
        indicators["rsi_1h"] = calc_rsi(closes_1h, CONFIG["indicators"]["rsi_period"])
        macd, signal, hist = calc_macd(closes_1h, 12, 26, 9)
        indicators["macd_1h"] = {"macd": macd, "signal": signal, "histogram": hist}

    # 일봉 기준 장기 지표
    candles_1d = market_data.get("candles_1d", [])
    if candles_1d:
        closes_1d = [c["close"] for c in candles_1d]
        indicators["rsi_1d"] = calc_rsi(closes_1d, CONFIG["indicators"]["rsi_period"])
        for p in [5, 20]:
            indicators[f"ma{p}_1d"] = calc_ma(closes_1d, p)

    # 추세 판단
    if candles_15m and len(candles_15m) >= 20:
        closes = [c["close"] for c in candles_15m]
        ma5 = calc_ma(closes, 5)
        ma20 = calc_ma(closes, 20)
        current = closes[-1]
        if ma5 and ma20:
            if ma5 > ma20 and current > ma5:
                indicators["trend"] = "상승"
            elif ma5 < ma20 and current < ma5:
                indicators["trend"] = "하락"
            else:
                indicators["trend"] = "횡보"

    return indicators


def run_analysis():
    data_path = BASE_DIR / "market_data" / "latest.json"
    if not data_path.exists():
        print("[ERROR] latest.json 없음. collector.py 먼저 실행하세요.")
        return

    data = json.loads(data_path.read_text())

    for market, mdata in data["markets"].items():
        print(f"  분석 중: {market}")
        mdata["indicators"] = analyze_market(mdata)

    data["analyzed_at"] = __import__("datetime").datetime.now().isoformat()
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"[OK] 기술지표 분석 완료")


if __name__ == "__main__":
    from datetime import datetime
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 기술지표 분석 시작...")
    run_analysis()
