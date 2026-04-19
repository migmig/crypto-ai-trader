"""Supabase Postgres 클라이언트 래퍼.

- 서버 사이드 전용 (service_role key 사용)
- trade_log / performance / state / action_history 읽기·쓰기
- 기존 CSV/JSON 파일과의 호환 유지를 위해 선택적 사용 (ENABLE_SUPABASE=1 일 때만 활성)

환경변수 (.env):
    SUPABASE_URL=https://xxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=<service_role jwt>
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).parent

_ENV_LOADED = False


def _load_env() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    env_path = BASE_DIR / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
    _ENV_LOADED = True


_client = None
_enabled: bool | None = None


def enabled() -> bool:
    """Supabase 연동이 켜져 있고 키가 있는지."""
    global _enabled
    if _enabled is not None:
        return _enabled
    _load_env()
    flag = os.environ.get("ENABLE_SUPABASE", "1") != "0"
    has_keys = bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
    _enabled = flag and has_keys
    return _enabled


def client():
    """지연 초기화된 Supabase 클라이언트 (service_role)."""
    global _client
    if _client is not None:
        return _client
    if not enabled():
        raise RuntimeError("Supabase disabled or keys missing")
    from supabase import create_client
    _client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    return _client


# ─────────────────────────────────────────────────
# trade_log
# ─────────────────────────────────────────────────

def insert_trade(action: str, market: str, qty: float, price: float,
                 amount_krw: float, fee: float, reason: str = "",
                 result: str = "", cash_after: float | None = None,
                 source: str | None = None, ts: datetime | None = None) -> None:
    if not enabled():
        return
    row = {
        "action": action, "market": market,
        "qty": qty, "price": price, "amount_krw": amount_krw, "fee": fee,
        "reason": reason, "result": result,
        "cash_after": cash_after, "source": source,
    }
    if ts:
        row["ts"] = ts.isoformat()
    client().table("trade_log").insert(row).execute()


def list_trades(limit: int = 200, market: str | None = None) -> list[dict]:
    if not enabled():
        return []
    q = client().table("trade_log").select("*").order("ts", desc=True).limit(limit)
    if market:
        q = q.eq("market", market)
    res = q.execute()
    return res.data or []


# ─────────────────────────────────────────────────
# performance
# ─────────────────────────────────────────────────

def insert_performance(ts: datetime, cash: float, holdings_value: float,
                        total_value: float, pl_krw: float, pl_pct: float,
                        num_holdings: int) -> None:
    if not enabled():
        return
    client().table("performance").upsert({
        "ts": ts.isoformat(),
        "cash": cash,
        "holdings_value": holdings_value,
        "total_value": total_value,
        "pl_krw": pl_krw,
        "pl_pct": pl_pct,
        "num_holdings": num_holdings,
    }).execute()


def list_performance(limit: int = 2000) -> list[dict]:
    if not enabled():
        return []
    res = client().table("performance").select("*").order("ts", desc=True).limit(limit).execute()
    # ts 오름차순으로 반환 (차트용)
    return sorted(res.data or [], key=lambda r: r["ts"])


# ─────────────────────────────────────────────────
# state (단일 행)
# ─────────────────────────────────────────────────

def get_state() -> dict | None:
    if not enabled():
        return None
    res = client().table("state").select("*").eq("id", 1).limit(1).execute()
    rows = res.data or []
    return rows[0] if rows else None


def upsert_state(initial_capital: float, cash: float, holdings: dict,
                 total_trades_today: int = 0,
                 last_trade_time: datetime | None = None,
                 today_date: str | None = None) -> None:
    if not enabled():
        return
    client().table("state").upsert({
        "id": 1,
        "initial_capital": initial_capital,
        "cash": cash,
        "holdings": holdings,
        "total_trades_today": total_trades_today,
        "last_trade_time": last_trade_time.isoformat() if last_trade_time else None,
        "today_date": today_date,
    }).execute()


# ─────────────────────────────────────────────────
# action_history
# ─────────────────────────────────────────────────

def insert_action(action_json: dict) -> None:
    if not enabled():
        return
    ts_raw = action_json.get("timestamp")
    if not ts_raw:
        return
    row = {
        "ts": ts_raw,
        "source": action_json.get("source", "algo"),
        "actions": action_json.get("actions", []),
        "market_summary": action_json.get("market_summary", ""),
        "risk_assessment": action_json.get("risk_assessment", ""),
        "per_coin": action_json.get("per_coin", {}),
        "conditions_checked": action_json.get("conditions_checked", []),
        "triggers_next_cycle": action_json.get("triggers_next_cycle", []),
        "has_non_hold": bool(action_json.get("has_non_hold", False)),
    }
    client().table("action_history").insert(row).execute()


def list_actions(limit: int = 50, offset: int = 0, source: str | None = None) -> list[dict]:
    if not enabled():
        return []
    q = client().table("action_history").select("*").order("ts", desc=True).range(offset, offset + limit - 1)
    if source:
        q = q.eq("source", source)
    res = q.execute()
    return res.data or []


def action_stats() -> dict:
    if not enabled():
        return {"total": 0, "ai_count": 0, "algo_count": 0, "with_actions": 0,
                "first_ts": None, "last_ts": None}
    c = client()
    total = c.table("action_history").select("id", count="exact").execute().count or 0
    ai = c.table("action_history").select("id", count="exact").eq("source", "ai").execute().count or 0
    algo = c.table("action_history").select("id", count="exact").eq("source", "algo").execute().count or 0
    with_actions = c.table("action_history").select("id", count="exact").neq("actions", "[]").execute().count or 0
    first = c.table("action_history").select("ts").order("ts", desc=False).limit(1).execute().data
    last = c.table("action_history").select("ts").order("ts", desc=True).limit(1).execute().data
    return {
        "total": total, "ai_count": ai, "algo_count": algo,
        "with_actions": with_actions,
        "first_ts": first[0]["ts"] if first else None,
        "last_ts": last[0]["ts"] if last else None,
    }


# ─────────────────────────────────────────────────
# 동기화: 기존 로컬 파일 → Postgres 이주
# ─────────────────────────────────────────────────

def migrate_from_local() -> dict:
    """trade_log.csv / performance.csv / state.json / history.db 를 Postgres로 이주.
    멱등성: 기존 ts가 이미 있으면 중복 insert 시도되니 처음 1회만 실행 권장.
    """
    if not enabled():
        raise RuntimeError("Supabase disabled")
    import csv
    counts = {"trade_log": 0, "performance": 0, "state": 0, "action_history": 0}

    # trade_log
    tp = BASE_DIR / "trade_log.csv"
    if tp.exists():
        rows = []
        with tp.open() as f:
            for r in csv.DictReader(f):
                try:
                    rows.append({
                        "ts": r["timestamp"],
                        "action": r["action"], "market": r["market"],
                        "qty": float(r["qty"] or 0),
                        "price": float(r["price"] or 0),
                        "amount_krw": float(r["amount_krw"] or 0),
                        "fee": float(r["fee"] or 0),
                        "reason": r.get("reason") or "",
                        "result": r.get("result") or "",
                        "cash_after": float(r["cash_after"]) if r.get("cash_after") else None,
                    })
                except Exception:
                    continue
        if rows:
            client().table("trade_log").insert(rows).execute()
            counts["trade_log"] = len(rows)

    # performance
    pp = BASE_DIR / "performance.csv"
    if pp.exists():
        rows = []
        with pp.open() as f:
            for r in csv.DictReader(f):
                try:
                    rows.append({
                        "ts": r["timestamp"],
                        "cash": float(r["cash"]),
                        "holdings_value": float(r["holdings_value"]),
                        "total_value": float(r["total_value"]),
                        "pl_krw": float(r["pl_krw"]),
                        "pl_pct": float(r["pl_pct"]),
                        "num_holdings": int(r["num_holdings"]),
                    })
                except Exception:
                    continue
        if rows:
            client().table("performance").upsert(rows).execute()
            counts["performance"] = len(rows)

    # state
    sp = BASE_DIR / "state.json"
    if sp.exists():
        s = json.loads(sp.read_text())
        upsert_state(
            initial_capital=s.get("initial_capital", 10_000_000),
            cash=s.get("cash", 10_000_000),
            holdings=s.get("holdings", {}),
            total_trades_today=s.get("total_trades_today", 0),
            last_trade_time=datetime.fromisoformat(s["last_trade_time"]) if s.get("last_trade_time") else None,
            today_date=s.get("today_date"),
        )
        counts["state"] = 1

    # action_history: SQLite history.db (schema: judgments with raw_json)
    hp = BASE_DIR / "history.db"
    if hp.exists():
        import sqlite3
        conn = sqlite3.connect(str(hp))
        try:
            cur = conn.execute("select timestamp, source, raw_json from judgments order by timestamp asc")
            rows = []
            for ts, source, raw in cur.fetchall():
                try:
                    obj = json.loads(raw) if raw else {}
                    rows.append({
                        "ts": ts,
                        "source": source or "algo",
                        "actions": obj.get("actions", []),
                        "market_summary": obj.get("market_summary", ""),
                        "risk_assessment": obj.get("risk_assessment", ""),
                        "per_coin": obj.get("per_coin", {}),
                        "conditions_checked": obj.get("conditions_checked", []),
                        "triggers_next_cycle": obj.get("triggers_next_cycle", []),
                        "has_non_hold": bool(obj.get("has_non_hold", False)),
                    })
                except Exception:
                    continue
        finally:
            conn.close()
        if rows:
            # chunk 단위 insert (Postgrest payload 한계 회피)
            CHUNK = 500
            for i in range(0, len(rows), CHUNK):
                client().table("action_history").insert(rows[i:i + CHUNK]).execute()
            counts["action_history"] = len(rows)

    return counts


if __name__ == "__main__":
    import sys
    _load_env()
    print(f"enabled: {enabled()}")
    if "--migrate" in sys.argv:
        print("migrating from local files...")
        print(migrate_from_local())
    elif "--state" in sys.argv:
        print(json.dumps(get_state(), ensure_ascii=False, indent=2, default=str))
    else:
        print("usage: python3 db.py [--migrate | --state]")
