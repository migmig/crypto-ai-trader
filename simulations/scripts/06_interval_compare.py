"""[시뮬 06] 캔들 인터벌 비교 — 15m이 최선인가?

Go 그리드 바이너리를 각 인터벌(15m/60m/240m/1d)에 대해 실행하고, 결과를 하나의 비교 CSV로 취합.
각 인터벌마다 100개 룰이 있으니 4×100=400 백테스트×10코인=4000 백테스트.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
import csv

ROOT = Path(__file__).resolve().parents[2]
SIM_ROOT = ROOT / "simulations"
GO_BIN = SIM_ROOT / "go-grid" / "go-grid"
RESULTS = SIM_ROOT / "results"

INTERVALS = ["minute15", "minute60", "minute240", "day"]
INTERVAL_LABEL = {"minute15": "15분", "minute60": "1시간", "minute240": "4시간", "day": "1일"}


def run_grid(interval: str) -> dict:
    data_dir = SIM_ROOT / "data" / interval
    if not data_dir.exists() or not list(data_dir.glob("*.csv")):
        print(f"  skip {interval}: data missing")
        return {}
    prefix = f"06_grid_{interval}"
    out = RESULTS / f"{prefix}.csv"
    cmd = [str(GO_BIN), "--data", str(data_dir), "--out", str(out), "--prefix", prefix]
    print(f"  → running {interval}...")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"    ERR: {r.stderr}")
        return {}
    return {
        "full_csv": out,
        "top_csv": RESULTS / f"{prefix}_top.csv",
        "per_coin_csv": RESULTS / f"{prefix}_per_coin.csv",
    }


def aggregate(all_results: dict[str, dict]) -> None:
    """인터벌 비교 요약 테이블 생성."""
    # 각 인터벌의 현재 룰 + 최고 룰 집계
    summary = []
    for interval, files in all_results.items():
        if not files:
            continue
        # top.csv에서 1등 + 현재 룰 행 추출
        top_path = files["top_csv"]
        with top_path.open() as f:
            rows = list(csv.DictReader(f))
        if not rows:
            continue
        best = rows[0]
        current = next((r for r in rows if "현재" in str(r.get("backstop_pct", ""))), None)
        summary.append({
            "interval": interval,
            "label": INTERVAL_LABEL.get(interval, interval),
            "best_rule_id": best["rule_id"],
            "best_backstop": best["backstop_pct"],
            "best_trailing": best["trailing_pct"],
            "best_min_profit": best["min_profit"],
            "best_avg_pnl": best["avg_pnl_pct"],
            "best_worst_coin": best["worst_pnl_pct"],
            "best_best_coin": best["best_pnl_pct"],
            "current_rule_avg_pnl": current["avg_pnl_pct"] if current else "N/A",
            "current_rule_rank": rows.index(current) + 1 if current else "N/A",
        })

    # 저장
    out_path = RESULTS / "06_interval_compare.csv"
    if summary:
        with out_path.open("w") as f:
            w = csv.DictWriter(f, fieldnames=list(summary[0].keys()))
            w.writeheader()
            w.writerows(summary)
        print(f"\nsaved → {out_path}")
        # 간단 출력
        print(f"\n{'interval':<10} {'best_avg':>9} {'현재_avg':>9} {'현재_순위':>10}  best params")
        print("-" * 80)
        for r in summary:
            print(f"{r['label']:<10} {r['best_avg_pnl']:>8}% {r['current_rule_avg_pnl']:>8}% {r['current_rule_rank']:>10}"
                  f"  b{r['best_backstop']} t{r['best_trailing']} mp{r['best_min_profit']}")


if __name__ == "__main__":
    print("=== 인터벌 비교 그리드 서치 ===")
    all_results = {}
    for iv in INTERVALS:
        files = run_grid(iv)
        if files:
            all_results[iv] = files
    aggregate(all_results)
