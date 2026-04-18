"""[시뮬 05 data] 10개 코인 × 1년치 15분봉 캐시 다운로드.

pyupbit가 자동 페이지네이션 + 레이트리밋 준수. 이미 받은 CSV는 건너뛰어 API 부담 최소화.
재다운로드 필요하면 `--force` 플래그.

파일 형식:
    simulations/data/KRW-{COIN}.csv
    columns: t, open, high, low, close, volume
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

import pyupbit

ROOT = Path(__file__).resolve().parents[2]
CFG = json.loads((ROOT / "config.json").read_text())
DATA_ROOT = Path(__file__).resolve().parents[1] / "data"
DATA_ROOT.mkdir(parents=True, exist_ok=True)

STALE_DAYS = 7

# 인터벌별 하루당 캔들 개수
PER_DAY = {
    "minute15": 96,
    "minute30": 48,
    "minute60": 24,
    "minute240": 6,
    "day": 1,
}


def cached_row_count(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open() as f:
        return sum(1 for _ in f) - 1


def is_fresh(path: Path, target_rows: int) -> bool:
    if not path.exists():
        return False
    age_days = (time.time() - path.stat().st_mtime) / 86400
    if age_days > STALE_DAYS:
        return False
    return cached_row_count(path) >= int(target_rows * 0.95)


def fetch_one(market: str, end: datetime, days: int, interval: str, force: bool = False) -> Path:
    interval_dir = DATA_ROOT / interval
    interval_dir.mkdir(parents=True, exist_ok=True)
    path = interval_dir / f"{market}.csv"
    target_rows = days * PER_DAY[interval]

    if not force and is_fresh(path, target_rows):
        print(f"  {market} [{interval}]: cache hit ({cached_row_count(path):,} rows)")
        return path

    print(f"  {market} [{interval}]: fetching {target_rows:,} candles ({days}일)...", flush=True)
    t0 = time.time()
    df = pyupbit.get_ohlcv(
        market, interval=interval,
        count=target_rows,
        to=end.strftime("%Y-%m-%d %H:%M:%S"),
    )
    if df is None or df.empty:
        raise RuntimeError(f"{market}: 데이터 비어 있음")
    df = df.reset_index().rename(columns={"index": "t"})
    df = df[["t", "open", "high", "low", "close", "volume"]]
    df.to_csv(path, index=False)
    elapsed = time.time() - t0
    print(f"  {market}: saved {len(df):,} rows in {elapsed:.1f}s → {path.name}")
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="cache 무시하고 재다운로드")
    ap.add_argument("--end", default="2026-04-18 12:00", help="종료 시각 (KST)")
    ap.add_argument("--days", type=int, default=365, help="몇 일치 (기본 365)")
    ap.add_argument("--interval", default="minute15",
                    choices=list(PER_DAY.keys()), help="캔들 인터벌")
    args = ap.parse_args()

    end = datetime.strptime(args.end, "%Y-%m-%d %H:%M")
    markets = CFG["markets"]
    target_dir = DATA_ROOT / args.interval
    print(f"10개 코인 × {args.days}일치 × {args.interval} 다운로드 (end={args.end})")
    print(f"저장 경로: {target_dir}")
    print(f"force 모드: {args.force}\n")

    for i, m in enumerate(markets, 1):
        print(f"[{i}/{len(markets)}]", end=" ")
        fetch_one(m, end=end, days=args.days, interval=args.interval, force=args.force)
        time.sleep(0.2)

    total = sum(f.stat().st_size for f in target_dir.glob('*.csv'))
    print(f"\n✅ 완료. 총 크기: {total:,} bytes")


if __name__ == "__main__":
    main()
