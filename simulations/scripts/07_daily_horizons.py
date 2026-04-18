"""[시뮬 07] 일봉 기반 다중 지평 그리드 서치.

지평: 15, 30, 45, 60, 90, 120, 360, 720, 1080 일. 데이터 충분한 최대까지.
각 지평마다 100룰 그리드 × 10코인 = 1000 백테스트. 총 9 × 1000 = 9000 백테스트.
"""
from __future__ import annotations

import subprocess
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SIM_ROOT = ROOT / "simulations"
GO_BIN = SIM_ROOT / "go-grid" / "go-grid"
DAY_DATA = SIM_ROOT / "data" / "day"
RESULTS = SIM_ROOT / "results"

HORIZONS = [15, 30, 45, 60, 90, 120, 360, 720, 1080]


def run_horizon(days: int) -> dict | None:
    prefix = f"07_daily_{days}d"
    out = RESULTS / f"{prefix}.csv"
    cmd = [
        str(GO_BIN),
        "--data", str(DAY_DATA),
        "--out", str(out),
        "--prefix", prefix,
        "--last", str(days),
    ]
    print(f"  → running {days}일 horizon...")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"    ERR: {r.stderr[:300]}")
        return None
    return {"top": RESULTS / f"{prefix}_top.csv",
            "per_coin": RESULTS / f"{prefix}_per_coin.csv"}


def aggregate(all_results: dict[int, dict]) -> None:
    """지평별 최고 룰 + 현재 룰 성과 비교."""
    summary = []
    for days, files in all_results.items():
        if not files:
            continue
        with files["top"].open() as f:
            rows = list(csv.DictReader(f))
        if not rows:
            continue
        best = rows[0]
        current = next((r for r in rows if "현재" in str(r.get("backstop_pct", ""))), None)
        summary.append({
            "horizon_days": days,
            "best_rule_id": best["rule_id"],
            "best_backstop": best["backstop_pct"],
            "best_trailing": best["trailing_pct"],
            "best_min_profit": best["min_profit"],
            "best_avg_pnl": best["avg_pnl_pct"],
            "best_worst_coin": best["worst_pnl_pct"],
            "best_best_coin": best["best_pnl_pct"],
            "current_rule_avg_pnl": current["avg_pnl_pct"] if current else "",
            "current_rule_rank": rows.index(current) + 1 if current else "",
        })

    out = RESULTS / "07_daily_horizons.csv"
    if summary:
        with out.open("w") as f:
            w = csv.DictWriter(f, fieldnames=list(summary[0].keys()))
            w.writeheader()
            w.writerows(summary)
        print(f"\nsaved → {out}")
        print(f"\n{'지평':>6} {'최적 avg':>10} {'현재 avg':>10} {'현재 순위':>10}  최적 파라미터")
        print("-" * 85)
        for r in summary:
            print(f"{r['horizon_days']:>5}일 {r['best_avg_pnl']:>9}% {r['current_rule_avg_pnl']:>9}% "
                  f"{r['current_rule_rank']:>10}  b{r['best_backstop']} t{r['best_trailing']} mp{r['best_min_profit']}")


if __name__ == "__main__":
    print("=== 일봉 지평별 그리드 서치 ===")
    all_results = {}
    for h in HORIZONS:
        res = run_horizon(h)
        if res:
            all_results[h] = res
    aggregate(all_results)
