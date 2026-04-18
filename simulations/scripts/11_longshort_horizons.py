"""[시뮬 11] 공매도 포함 백테스트를 5개 지평에서 각각 실행.

지평: 30일, 60일, 90일, 365일(1년), 730일(2년).
각 지평마다 long / short / long+short 모드로 10 코인 돌림.
"""
from __future__ import annotations

import subprocess
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SIM_ROOT = ROOT / "simulations"
GO_BIN = SIM_ROOT / "go-longshort" / "go-longshort"
DAY_DATA = SIM_ROOT / "data" / "day"
RESULTS = SIM_ROOT / "results"

HORIZONS = [30, 60, 90, 365, 730]


def run_horizon(days: int):
    out = RESULTS / f"11_longshort_{days}d.csv"
    cmd = [str(GO_BIN), "--data", str(DAY_DATA), "--out", str(out), "--last", str(days)]
    print(f"  → running {days}일 ...")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"    ERR: {r.stderr[:300]}")
        return None
    return out


def aggregate():
    """지평별 × 모드별 평균 수익률 + 낙폭 집계."""
    rows = []  # [{horizon, mode, avg_pnl, avg_dd}]
    for days in HORIZONS:
        csv_path = RESULTS / f"11_longshort_{days}d.csv"
        if not csv_path.exists():
            continue
        by_mode = {"long": [], "short": [], "long_short": []}
        with csv_path.open() as f:
            for row in csv.DictReader(f):
                mode = row["mode"]
                if mode in by_mode:
                    by_mode[mode].append((float(row["pnl_pct"]), float(row["max_dd_pct"])))
        for mode, pairs in by_mode.items():
            if not pairs:
                continue
            avg_pnl = sum(p[0] for p in pairs) / len(pairs)
            avg_dd = sum(p[1] for p in pairs) / len(pairs)
            rows.append({
                "horizon_days": days,
                "mode": mode,
                "avg_pnl_pct": round(avg_pnl, 2),
                "avg_max_dd_pct": round(avg_dd, 2),
                "n_coins": len(pairs),
            })

    out = RESULTS / "11_longshort_horizons.csv"
    with out.open("w") as f:
        w = csv.DictWriter(f, fieldnames=["horizon_days", "mode", "avg_pnl_pct", "avg_max_dd_pct", "n_coins"])
        w.writeheader()
        w.writerows(rows)
    print(f"\nsaved → {out}")
    # 출력
    print(f"\n{'horizon':>8}  {'long':>10}  {'short':>10}  {'L+S':>10}  {'long-dd':>10}  {'L+S-dd':>10}")
    print("-" * 72)
    by_horizon = {}
    for r in rows:
        by_horizon.setdefault(r["horizon_days"], {})[r["mode"]] = r
    for days in HORIZONS:
        h = by_horizon.get(days, {})
        lp = h.get("long", {}).get("avg_pnl_pct", 0)
        sp = h.get("short", {}).get("avg_pnl_pct", 0)
        lsp = h.get("long_short", {}).get("avg_pnl_pct", 0)
        ld = h.get("long", {}).get("avg_max_dd_pct", 0)
        lsd = h.get("long_short", {}).get("avg_max_dd_pct", 0)
        print(f"{days:>5}일  {lp:>+9.2f}%  {sp:>+9.2f}%  {lsp:>+9.2f}%  {ld:>+9.2f}%  {lsd:>+9.2f}%")


if __name__ == "__main__":
    print("=== 지평별 long / short / long+short 비교 ===")
    for h in HORIZONS:
        run_horizon(h)
    aggregate()
