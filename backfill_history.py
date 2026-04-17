#!/usr/bin/env python3
"""action_history/ 의 모든 JSON + tar.gz 를 SQLite(history.db)에 임포트.
중복(timestamp+source)은 자동 스킵. 여러 번 실행해도 안전.
"""
import json
import tarfile
from pathlib import Path
from history_db import get_db, insert_judgment

BASE_DIR = Path(__file__).parent
HISTORY_DIR = BASE_DIR / "action_history"


def main():
    if not HISTORY_DIR.exists():
        print("[ERROR] action_history/ 없음")
        return

    conn = get_db()
    inserted = 0
    skipped = 0
    errors = 0

    # 1) 개별 JSON
    json_files = sorted(HISTORY_DIR.glob("action_*.json"))
    print(f"[INFO] JSON 파일 {len(json_files)}개 임포트 중...")
    for f in json_files:
        try:
            data = json.loads(f.read_text())
            cursor = conn.execute(
                """INSERT OR IGNORE INTO judgments
                   (timestamp, source, has_actions, action_count, market_summary, risk_assessment, raw_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    data.get("timestamp", ""),
                    data.get("source", ""),
                    1 if data.get("actions") else 0,
                    len(data.get("actions") or []),
                    data.get("market_summary", ""),
                    data.get("risk_assessment", ""),
                    json.dumps(data, ensure_ascii=False),
                ),
            )
            if cursor.rowcount > 0:
                inserted += 1
            else:
                skipped += 1
        except Exception as e:
            errors += 1
            print(f"  [WARN] {f.name}: {e}")

    conn.commit()

    # 2) tar.gz 아카이브
    archives = sorted(HISTORY_DIR.glob("archive_*.tar.gz"))
    print(f"[INFO] 아카이브 {len(archives)}개 임포트 중...")
    for arc in archives:
        try:
            with tarfile.open(arc, "r:gz") as tf:
                members = tf.getnames()
                for name in members:
                    try:
                        data = json.loads(tf.extractfile(name).read())
                        cursor = conn.execute(
                            """INSERT OR IGNORE INTO judgments
                               (timestamp, source, has_actions, action_count, market_summary, risk_assessment, raw_json)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (
                                data.get("timestamp", ""),
                                data.get("source", ""),
                                1 if data.get("actions") else 0,
                                len(data.get("actions") or []),
                                data.get("market_summary", ""),
                                data.get("risk_assessment", ""),
                                json.dumps(data, ensure_ascii=False),
                            ),
                        )
                        if cursor.rowcount > 0:
                            inserted += 1
                        else:
                            skipped += 1
                    except Exception as e:
                        errors += 1
                        print(f"  [WARN] {arc.name}:{name}: {e}")
            conn.commit()
        except Exception as e:
            print(f"[ERROR] {arc.name}: {e}")

    conn.close()

    from history_db import stats
    s = stats()
    print(f"\n[완료]")
    print(f"  신규 삽입: {inserted}")
    print(f"  중복 스킵: {skipped}")
    print(f"  에러:     {errors}")
    print(f"\n[DB 통계]")
    print(f"  총 판단:   {s['total']}")
    print(f"  AI:       {s['ai_count']}")
    print(f"  ALGO:     {s['algo_count']}")
    print(f"  w/actions: {s['with_actions']}")
    print(f"  기간:     {s['first_ts']} ~ {s['last_ts']}")


if __name__ == "__main__":
    main()
