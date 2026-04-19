#!/usr/bin/env python3
"""판단 히스토리 SQLite 저장소.

사용:
    from history_db import get_db, insert_judgment, query_judgments

설계:
  - judgments 테이블: 1건의 판단 (timestamp, source, 요약, 원본 JSON)
  - 자주 필터/정렬하는 컬럼은 실 컬럼으로 두고, 상세는 raw_json에 통째로 보관
  - 인덱스: timestamp DESC, source, has_actions
"""
import json
import sqlite3
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "history.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS judgments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    has_actions INTEGER NOT NULL DEFAULT 0,
    action_count INTEGER NOT NULL DEFAULT 0,
    market_summary TEXT DEFAULT '',
    risk_assessment TEXT DEFAULT '',
    raw_json TEXT NOT NULL,
    UNIQUE(timestamp, source)
);
CREATE INDEX IF NOT EXISTS idx_judgments_ts ON judgments(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_judgments_source ON judgments(source);
CREATE INDEX IF NOT EXISTS idx_judgments_actions ON judgments(has_actions);
"""


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def insert_judgment(data: dict, conn: Optional[sqlite3.Connection] = None) -> bool:
    """판단 1건 삽입. 중복(timestamp+source)은 무시. 성공 시 True.
    Supabase 연동 활성 시 action_history 테이블에도 dual-write."""
    own_conn = conn is None
    if own_conn:
        conn = get_db()
    try:
        actions = data.get("actions") or []
        conn.execute(
            """INSERT OR IGNORE INTO judgments
               (timestamp, source, has_actions, action_count, market_summary, risk_assessment, raw_json)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                data.get("timestamp", ""),
                data.get("source", ""),
                1 if actions else 0,
                len(actions),
                data.get("market_summary", ""),
                data.get("risk_assessment", ""),
                json.dumps(data, ensure_ascii=False),
            ),
        )
        if own_conn:
            conn.commit()
        # Supabase dual-write (실패해도 로컬 저장은 유지)
        try:
            import db as _pg
            if _pg.enabled():
                _pg.insert_action(data)
        except Exception:
            pass
        return True
    finally:
        if own_conn:
            conn.close()


def query_judgments(
    offset: int = 0,
    limit: int = 50,
    source: Optional[str] = None,
    actions_only: bool = False,
    hold_only: bool = False,
    since: Optional[str] = None,
    until: Optional[str] = None,
) -> dict:
    """필터링/페이지네이션. 반환: {items, total, offset, limit, has_more}"""
    where = []
    params: list = []
    if source and source != "all":
        where.append("source = ?")
        params.append(source)
    if actions_only:
        where.append("has_actions = 1")
    if hold_only:
        where.append("has_actions = 0")
    if since:
        where.append("timestamp >= ?")
        params.append(since)
    if until:
        where.append("timestamp <= ?")
        params.append(until)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    conn = get_db()
    try:
        total = conn.execute(
            f"SELECT COUNT(*) FROM judgments {where_sql}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"""SELECT raw_json FROM judgments {where_sql}
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?""",
            (*params, limit, offset),
        ).fetchall()
        items = [json.loads(r["raw_json"]) for r in rows]
    finally:
        conn.close()

    return {
        "items": items,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + len(items) < total,
    }


def stats() -> dict:
    """전체 통계"""
    conn = get_db()
    try:
        r = conn.execute(
            """SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN source='ai' THEN 1 ELSE 0 END) AS ai_count,
                SUM(CASE WHEN source='algo' THEN 1 ELSE 0 END) AS algo_count,
                SUM(has_actions) AS with_actions,
                MIN(timestamp) AS first_ts,
                MAX(timestamp) AS last_ts
               FROM judgments"""
        ).fetchone()
        return dict(r)
    finally:
        conn.close()


if __name__ == "__main__":
    # 테이블 생성만
    conn = get_db()
    conn.close()
    print(f"[OK] {DB_PATH} 준비 완료")
    print(stats())
