"""[시뮬 02] 매도 룰 완화안 A~F 비교 (단일 포지션 기준).

같은 2/5 진입 포지션에 서로 다른 룰 세트 적용. '어느 완화가 진짜 효과 있나' 초기 판정.
이 결과만 보면 F2가 이상적이지만, 시뮬 03에서 다른 시장 조건에선 다르게 나옴.
"""
from datetime import datetime
from pathlib import Path
import csv

from common import RuleConfig, fetch_candles, single_position

OUT = Path(__file__).resolve().parents[1] / "results"
OUT.mkdir(parents=True, exist_ok=True)

df = fetch_candles(days=80, end=datetime(2026, 4, 18, 12, 0))
start_idx = next(i for i, r in df.iterrows() if r["t"] >= datetime(2026, 2, 5))

variants = {
    "현재 룰 (-15% 전량)": RuleConfig(backstop_pct=-0.15),
    "A. -25% 전량":        RuleConfig(backstop_pct=-0.25),
    "B. -15% 50% 부분":    RuleConfig(backstop_pct=-0.15, partial_backstop=0.5),
    "C. -25% + RSI<20 유예": RuleConfig(backstop_pct=-0.25, rsi_pause_below=20),
    "D. -25% + 유예 + 50% 부분": RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20, partial_backstop=0.5),
    "E. D + sell_strong 50%": RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20,
        partial_backstop=0.5, sell_strong_ratio=0.5),
    "F1. +3% 익절만":      RuleConfig(sell_strong_min_profit=0.03),
    "F2. +3% 익절 + -25% + 유예": RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20, sell_strong_min_profit=0.03),
    "F3. F2 + 50% 부분":   RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20,
        partial_backstop=0.5, sell_strong_ratio=0.5, sell_strong_min_profit=0.03),
    "F4. F2 + trailing -3%": RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20,
        sell_strong_min_profit=0.03, trailing_pct=-0.03),
    "F5. +5% 익절 + -25% + 유예": RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20, sell_strong_min_profit=0.05),
}

rows = []
for name, rule in variants.items():
    pnl, events = single_position(df, start_idx, rule, invest=1_000_000)
    rows.append({"variant": name, "pnl_pct": round(pnl, 2), "events": len(events)})

# 홀딩 벤치
avg = df.iloc[start_idx]["close"]
last = df.iloc[-1]["close"]
hold_pct = (last / avg - 1) * 100
rows.append({"variant": "단순 홀딩", "pnl_pct": round(hold_pct, 2), "events": 0})

for r in sorted(rows, key=lambda x: x["pnl_pct"], reverse=True):
    marker = " ⭐" if r["pnl_pct"] >= hold_pct - 0.5 else ""
    print(f"{r['variant']:<40} {r['pnl_pct']:>7.2f}%  {r['events']:>2}회{marker}")

with (OUT / "02_mitigation_variants.csv").open("w") as f:
    w = csv.DictWriter(f, fieldnames=["variant", "pnl_pct", "events"])
    w.writeheader()
    w.writerows(rows)
print(f"\nsaved → {OUT / '02_mitigation_variants.csv'}")
