"""[시뮬 03] 여러 시간 지평(30/60/90/120/150일)에서 룰 비교.

단일 포지션 기준. 각 지평의 "그때 매수했다면" 시나리오로 룰 세트 성능 측정.
핵심 발견: 시뮬 02에서 F2가 최고였지만, 하락장 지평(90/150일)에선 -25%까지 물림.
현재 룰이 하락장에선 오히려 가장 안전. → "룰 자체는 튜닝이 어렵고 현재 균형이 나쁘지 않다"
"""
from datetime import datetime
from pathlib import Path
import csv

from common import RuleConfig, fetch_candles, single_position, horizon_starts

OUT = Path(__file__).resolve().parents[1] / "results"
OUT.mkdir(parents=True, exist_ok=True)

END = datetime(2026, 4, 18, 12, 0)
HORIZONS = [30, 60, 90, 120, 150]

df = fetch_candles(days=150, end=END)
starts = horizon_starts(df, HORIZONS, end=END)

variants = {
    "현재 룰 (-15% 전량)": RuleConfig(backstop_pct=-0.15),
    "E. -25% + 유예 + 50%": RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20,
        partial_backstop=0.5, sell_strong_ratio=0.5),
    "F2. +3% 익절 + -25% + 유예": RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20, sell_strong_min_profit=0.03),
    "F3. F2 + 모든매도 50%": RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20,
        partial_backstop=0.5, sell_strong_ratio=0.5, sell_strong_min_profit=0.03),
    "F5. +5% 익절 + -25% + 유예": RuleConfig(
        backstop_pct=-0.25, rsi_pause_below=20, sell_strong_min_profit=0.05),
    "타협안 (-15% + RSI<20 유예)": RuleConfig(
        backstop_pct=-0.15, rsi_pause_below=20),
}

# 각 지평의 홀딩 벤치
last = df.iloc[-1]["close"]
hold_pnls = {h: (last / df.iloc[starts[h]]["close"] - 1) * 100 for h in HORIZONS}

rows = []
# 먼저 홀딩 벤치마크
rows.append({"variant": "단순 홀딩", **{f"d{h}": round(hold_pnls[h], 2) for h in HORIZONS},
             "avg": round(sum(hold_pnls.values()) / len(HORIZONS), 2)})

for name, rule in variants.items():
    pnls = {}
    for h in HORIZONS:
        pnl, _ = single_position(df, starts[h], rule, invest=1_000_000)
        pnls[h] = pnl
    avg = sum(pnls.values()) / len(pnls)
    rows.append({"variant": name,
                 **{f"d{h}": round(pnls[h], 2) for h in HORIZONS},
                 "avg": round(avg, 2)})

# 출력
print(f"{'전략':<32}", end="")
for h in HORIZONS:
    print(f"{str(h)+'일':>9}", end=" ")
print("  평균")
print("-" * 95)
for r in rows:
    print(f"{r['variant']:<32}", end="")
    for h in HORIZONS:
        print(f"{r[f'd{h}']:>8.2f}%", end=" ")
    print(f"  {r['avg']:>6.2f}%")

fields = ["variant"] + [f"d{h}" for h in HORIZONS] + ["avg"]
with (OUT / "03_multi_horizon.csv").open("w") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)
print(f"\nsaved → {OUT / '03_multi_horizon.csv'}")
