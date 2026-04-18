"""[시뮬 01] 2026-02-05 BTC 매수 포지션이 현재 룰에선 어떻게 털렸는가.

가정: 2/5 새벽에 BTC 평단 ₩108M에 ₩1M 매수 후 룰 적용 → 2026-04-18까지 추적.
목적: CLAUDE.md의 현재 매도 룰(-15% 백스톱)이 변동성 큰 구간에서 어떻게 작동하는지 시연.
"""
from datetime import datetime
from pathlib import Path

from common import RuleConfig, fetch_candles, single_position, FEE

OUT = Path(__file__).resolve().parents[1] / "results"
OUT.mkdir(parents=True, exist_ok=True)

df = fetch_candles(days=80, end=datetime(2026, 4, 18, 12, 0))
# 2/5 00:00 이후 첫 캔들 찾기
start_idx = next(i for i, r in df.iterrows() if r["t"] >= datetime(2026, 2, 5))
print(f"시작 지점: {df.iloc[start_idx]['t']}  ({df.iloc[start_idx]['close']:,.0f})")

variants = {
    "기존 (현재 룰 -15%)":  RuleConfig(backstop_pct=-0.15),
    "A. -25%":             RuleConfig(backstop_pct=-0.25),
    "E. -25% + RSI<20 유예 + 부분매도": RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20,
        partial_backstop=0.5, sell_strong_ratio=0.5),
    "F2. +3% 익절 + -25% + 유예": RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20,
        sell_strong_min_profit=0.03),
}

rows = []
for name, rule in variants.items():
    pnl, events = single_position(df, start_idx, rule, invest=1_000_000)
    rows.append({"variant": name, "pnl_pct": round(pnl, 2), "events": len(events)})
    print(f"\n▶ {name}  → {pnl:+.2f}%  (이벤트 {len(events)}회)")
    for t, p, r, ratio, profit in events[:5]:
        print(f"   {t!s:<20} ₩{p:>12,.0f}  {ratio*100:>3.0f}%  {profit:+5.1f}%  {r}")
    if len(events) > 5:
        print(f"   ... +{len(events)-5}회")

# 홀딩 벤치
avg = df.iloc[start_idx]["close"]
last = df.iloc[-1]["close"]
hold_pct = (last / avg - 1) * 100
print(f"\n단순 홀딩 (수수료 무시): {hold_pct:+.2f}%")

import csv
with (OUT / "01_feb5_position.csv").open("w") as f:
    w = csv.DictWriter(f, fieldnames=["variant", "pnl_pct", "events"])
    w.writeheader()
    w.writerows(rows)
print(f"\nsaved → {OUT / '01_feb5_position.csv'}")
