"""[시뮬 04] 매수 신호 빈도에 따른 적응형 포지션 사이즈.

시뮬 03에서 룰 튜닝이 한계에 부딪히자, "룰이 아닌 사이즈" 관점으로 전환.
풀 백테스트(₩10M 초기, 현재 매도 룰 고정, 매수 사이즈만 변형).

핵심 발견: "빈도 높을수록 줄이자"는 직관은 전부 실패. 역발상(빈도↑→size↑)이 미세 우위.
다만 개선 폭이 평균 +0.21%p로 작아 실전 도입은 신중.
"""
import math
from datetime import datetime
from pathlib import Path
import csv

from common import fetch_candles, full_backtest, horizon_starts

OUT = Path(__file__).resolve().parents[1] / "results"
OUT.mkdir(parents=True, exist_ok=True)

END = datetime(2026, 4, 18, 12, 0)
HORIZONS = [30, 60, 90, 120, 150]

df = fetch_candles(days=150, end=END)
starts = horizon_starts(df, HORIZONS, end=END)

STRATS = [
    ("고정 30% (현재)",          lambda n: 1.0),
    ("고정 20%",                 lambda n: 20/30),
    ("고정 15%",                 lambda n: 15/30),
    ("A. n≥2 시 반감",           lambda n: 1.0 if n < 2 else 0.5),
    ("B. 1/(1+n) 반비례",        lambda n: 1.0 / (1 + max(0, n))),
    ("C. 1/sqrt(1+n)",           lambda n: 1.0 / math.sqrt(1 + max(0, n))),
    ("D. 계단 감쇠",             lambda n: 1.0 if n <= 1 else 0.7 if n <= 2 else 0.4),
    ("E. 역발상 (n↑→size↑)",     lambda n: min(1.5, 1.0 + 0.15 * n)),
]

rows = []
for name, fn in STRATS:
    pnls, trades = [], []
    for h in HORIZONS:
        res = full_backtest(df, starts[h], size_fn=fn)
        pnls.append(res["pnl_pct"])
        trades.append(res["n_buys"] + res["n_sells"])
    avg = sum(pnls) / len(pnls)
    rows.append({"strategy": name,
                 **{f"d{h}": round(pnls[i], 2) for i, h in enumerate(HORIZONS)},
                 "avg": round(avg, 2),
                 "total_trades": sum(trades)})

# 출력
print(f"{'전략':<32}", end="")
for h in HORIZONS:
    print(f"{str(h)+'일':>9}", end=" ")
print("  평균  거래")
print("-" * 100)
for r in rows:
    print(f"{r['strategy']:<32}", end="")
    for h in HORIZONS:
        print(f"{r[f'd{h}']:>8.2f}%", end=" ")
    print(f"  {r['avg']:>6.2f}%  {r['total_trades']}")

best = max(rows, key=lambda r: r["avg"])
print(f"\n🏆 최고 평균: {best['strategy']}  → {best['avg']:+.2f}%")

fields = ["strategy"] + [f"d{h}" for h in HORIZONS] + ["avg", "total_trades"]
with (OUT / "04_adaptive_sizing.csv").open("w") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)
print(f"\nsaved → {OUT / '04_adaptive_sizing.csv'}")
