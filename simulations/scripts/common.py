"""백테스트 공용 유틸.

CLAUDE.md의 매매 룰을 벡터화해서 빠르게 돌리는 엔진.
pyupbit로 데이터 받아와 pandas로 지표 계산 후 Python 루프로 포지션 추적.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, Optional

import numpy as np
import pandas as pd
import pyupbit

ROOT = Path(__file__).resolve().parents[2]
CFG = json.loads((ROOT / "config.json").read_text())
IND = CFG["indicators"]
FEE = CFG["fee_rate"]
TRAIL_DEFAULT = CFG["safety"]["trailing_stop_pct"]
BACKSTOP_DEFAULT = CFG["safety"]["max_loss_pct"]


def fetch_candles(market: str = "KRW-BTC", days: int = 150,
                  end: datetime = datetime(2026, 4, 18, 12, 0)) -> pd.DataFrame:
    """pyupbit 15분봉 데이터 + 벡터화 지표 부착."""
    df = pyupbit.get_ohlcv(
        market, interval="minute15",
        count=days * 96 + 100,
        to=end.strftime("%Y-%m-%d %H:%M:%S"),
    )
    df = df.reset_index().rename(columns={"index": "t"})
    close = df["close"]

    # RSI
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(IND["rsi_period"]).mean()
    loss = (-delta.clip(upper=0)).rolling(IND["rsi_period"]).mean()
    rs = gain / loss.replace(0, np.nan)
    df["rsi"] = 100 - 100 / (1 + rs)

    # MACD 히스토그램 (현재, 직전)
    ema_fast = close.ewm(span=IND["macd_fast"], adjust=False).mean()
    ema_slow = close.ewm(span=IND["macd_slow"], adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal = macd_line.ewm(span=IND["macd_signal"], adjust=False).mean()
    df["hist"] = macd_line - signal
    df["prev_hist"] = df["hist"].shift(1)

    # Bollinger
    ma = close.rolling(IND["bb_period"]).mean()
    std = close.rolling(IND["bb_period"]).std()
    df["bb_u"] = ma + IND["bb_std"] * std
    df["bb_l"] = ma - IND["bb_std"] * std

    # MA & volume ratio
    df["ma5"] = close.rolling(5).mean()
    df["ma20"] = close.rolling(20).mean()
    df["vr"] = df["volume"] / df["volume"].rolling(20).mean()

    return df


def signal_at(row: dict) -> str:
    """단일 행에 대한 알고리즘 신호 (signals.py와 동일 룰)."""
    rsi, hist, prev = row["rsi"], row["hist"], row["prev_hist"]
    bb_u, bb_l, vr = row["bb_u"], row["bb_l"], row["vr"]
    ma5, ma20, price = row["ma5"], row["ma20"], row["close"]

    if any(pd.isna(x) for x in [rsi, hist, prev, bb_u, bb_l, ma5, ma20, vr]):
        return "hold"

    trend = "횡보"
    if ma5 > ma20 and price > ma5:
        trend = "상승"
    elif ma5 < ma20 and price < ma5:
        trend = "하락"

    golden = prev < 0 <= hist
    rising = prev < 0 and hist > prev
    dead = prev > 0 >= hist
    near_l = price <= bb_l * 1.02
    near_u = price >= bb_u * 0.98

    if rsi <= 35 and (golden or rising) and vr >= 1.3:
        return "buy_strong"
    if rsi <= 40 and near_l and trend != "하락":
        return "buy"
    if rsi >= 70 and dead:
        return "sell_strong"
    if rsi >= 65 and near_u and trend == "하락":
        return "sell"
    return "hold"


@dataclass
class RuleConfig:
    """매도 룰 변형 파라미터."""
    backstop_pct: float = BACKSTOP_DEFAULT
    trailing_pct: float = TRAIL_DEFAULT
    partial_backstop: float = 1.0           # 백스톱 발동 시 매도 비율
    rsi_pause_below: Optional[float] = None  # 이 값 미만이면 백스톱 유예
    sell_strong_min_profit: Optional[float] = None  # +X% 이상에서만 sell_strong 발동
    sell_strong_ratio: float = 1.0           # sell_strong 매도 비율


def single_position(df: pd.DataFrame, start_idx: int, rule: RuleConfig,
                    invest: float = 1_000_000) -> tuple[float, list]:
    """시작 시점에 고정 금액 매수 후 룰대로 매도만. 수익률 % 반환."""
    rows = df.to_dict("records")
    if start_idx < 40 or start_idx >= len(rows):
        return 0.0, []

    avg = rows[start_idx]["close"]
    qty = invest / avg * (1 - FEE)
    cash = 0
    peak = 0
    backstop_cd = None
    events = []

    for i in range(start_idx + 1, len(rows)):
        if qty <= 0:
            break
        r = rows[i]
        price, t = r["close"], r["t"]
        if price > avg:
            peak = max(peak, price)
        if backstop_cd and t < backstop_cd:
            continue

        sig = signal_at(r)
        rsi = r["rsi"]
        sell_ratio, reason = 0, None
        profit = (price / avg) - 1

        if sig == "sell_strong":
            if rule.sell_strong_min_profit is None or profit >= rule.sell_strong_min_profit:
                sell_ratio, reason = rule.sell_strong_ratio, "sell_strong"
        elif sig == "sell":
            if rule.sell_strong_min_profit is None or profit >= rule.sell_strong_min_profit:
                sell_ratio, reason = 0.5, "sell"
        elif peak > 0 and price > avg * 0.99 and price <= peak * (1 + rule.trailing_pct):
            sell_ratio, reason = 1.0, "trail"
        elif price <= avg * (1 + rule.backstop_pct):
            if rule.rsi_pause_below is not None and rsi is not None and rsi < rule.rsi_pause_below:
                pass
            else:
                sell_ratio, reason = rule.partial_backstop, "backstop"

        if sell_ratio > 0:
            sold = qty * sell_ratio
            cash += sold * price * (1 - FEE)
            qty -= sold
            events.append((t, price, reason, sell_ratio, profit * 100))
            if reason == "backstop":
                backstop_cd = t + timedelta(minutes=30)

    final = cash + qty * rows[-1]["close"]
    pnl_pct = (final / invest - 1) * 100
    return pnl_pct, events


@dataclass
class PortfolioState:
    cash: float
    qty: float = 0.0
    cost: float = 0.0      # 매수 누적 금액 (평단 계산용)
    peak: float = 0.0
    recent_buys: list = field(default_factory=list)
    n_buys: int = 0
    n_sells: int = 0


def full_backtest(df: pd.DataFrame, start_idx: int,
                  size_fn: Callable[[int], float] = lambda n: 1.0,
                  base_pct: float = 0.30,
                  rule: RuleConfig = RuleConfig(),
                  cash_init: float = 10_000_000) -> dict:
    """전체 매매 사이클 백테스트 (매수·매도 룰 모두 적용).

    size_fn: 최근 4시간 내 매수 횟수 → 기본 사이즈 배수 (0~1.5 등).
    """
    rows = df.to_dict("records")
    s = PortfolioState(cash=cash_init)
    equity_curve = []

    for i in range(start_idx, len(rows)):
        if i < 40:
            continue
        r = rows[i]
        price, t = r["close"], r["t"]
        equity = s.cash + s.qty * price
        avg = s.cost / s.qty if s.qty > 0 else 0
        equity_curve.append((t, equity))

        # 최근 4시간 내 매수 카운트
        cutoff = t - timedelta(hours=4)
        s.recent_buys = [rt for rt in s.recent_buys if rt >= cutoff]
        adapt = size_fn(len(s.recent_buys))

        if s.qty > 0 and price > avg:
            s.peak = max(s.peak, price)

        sig = signal_at(r)

        # 매도
        if s.qty > 0:
            sell_ratio = 0
            reason = None
            profit = (price / avg - 1) if avg > 0 else 0
            if sig == "sell_strong":
                if rule.sell_strong_min_profit is None or profit >= rule.sell_strong_min_profit:
                    sell_ratio, reason = rule.sell_strong_ratio, "sell_strong"
            elif sig == "sell":
                if rule.sell_strong_min_profit is None or profit >= rule.sell_strong_min_profit:
                    sell_ratio, reason = 0.5, "sell"
            elif s.peak > 0 and price > avg * 0.99 and price <= s.peak * (1 + rule.trailing_pct):
                sell_ratio, reason = 1.0, "trail"
            elif avg > 0 and price <= avg * (1 + rule.backstop_pct):
                if rule.rsi_pause_below is not None and r["rsi"] is not None and r["rsi"] < rule.rsi_pause_below:
                    pass
                else:
                    sell_ratio, reason = rule.partial_backstop, "backstop"
            if sell_ratio > 0:
                sold = s.qty * sell_ratio
                s.cash += sold * price * (1 - FEE)
                s.cost *= (1 - sell_ratio)
                s.qty -= sold
                s.n_sells += 1
                if s.qty == 0:
                    s.peak = 0

        # 매수
        if sig in ("buy_strong", "buy"):
            pct = (base_pct if sig == "buy_strong" else 0.10) * adapt
            target = equity * pct
            amt = min(target, s.cash)
            if s.qty * price + amt > equity * 0.5:
                amt = max(0, equity * 0.5 - s.qty * price)
            if amt >= 5000:
                s.qty += amt / price * (1 - FEE)
                s.cost += amt
                s.cash -= amt
                s.n_buys += 1
                s.recent_buys.append(t)

    final = s.cash + s.qty * rows[-1]["close"]
    pnl_pct = (final / cash_init - 1) * 100
    return {
        "pnl_pct": pnl_pct,
        "final_value": final,
        "n_buys": s.n_buys,
        "n_sells": s.n_sells,
        "equity_curve": equity_curve,
    }


def horizon_starts(df: pd.DataFrame, horizons: list[int],
                   end: datetime = datetime(2026, 4, 18, 12, 0)) -> dict[int, int]:
    """각 지평(N일)에 대응하는 df 인덱스 (해당 시각 이후 첫 캔들)."""
    rows = df.to_dict("records")
    starts = {}
    for h in horizons:
        target = end - timedelta(days=h)
        for i, r in enumerate(rows):
            t = r["t"].to_pydatetime() if hasattr(r["t"], "to_pydatetime") else r["t"]
            if t >= target:
                starts[h] = i
                break
    return starts


__all__ = [
    "CFG", "FEE", "ROOT",
    "RuleConfig", "fetch_candles", "signal_at",
    "single_position", "full_backtest", "horizon_starts",
]
