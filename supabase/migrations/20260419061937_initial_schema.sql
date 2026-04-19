-- 초기 스키마: trade_log / performance / state / action_history
-- Phase 1: 로컬 CSV/JSON/SQLite 데이터를 Postgres로 이주하기 위한 기반 테이블.
-- 이후 Phase 3에서 RLS 정책과 auth 도입.

-- ─────────────────────────────────────────────────
-- trade_log: 체결된 거래 로그 (append-only)
-- ─────────────────────────────────────────────────
create table public.trade_log (
  id          bigserial primary key,
  ts          timestamptz not null default now(),
  action      text not null check (action in ('buy', 'sell')),
  market      text not null,
  qty         numeric not null,
  price       numeric not null,
  amount_krw  numeric not null,
  fee         numeric not null,
  reason      text,
  result      text,
  cash_after  numeric,
  source      text
);

create index trade_log_ts_idx on public.trade_log (ts desc);
create index trade_log_market_ts_idx on public.trade_log (market, ts desc);

-- ─────────────────────────────────────────────────
-- performance: 시계열 평가 스냅샷
-- ─────────────────────────────────────────────────
create table public.performance (
  ts              timestamptz primary key,
  cash            numeric not null,
  holdings_value  numeric not null,
  total_value     numeric not null,
  pl_krw          numeric not null,
  pl_pct          numeric not null,
  num_holdings    int not null
);

create index performance_ts_desc_idx on public.performance (ts desc);

-- ─────────────────────────────────────────────────
-- state: 현재 계좌 상태 (단일 행 — id=1 고정)
-- ─────────────────────────────────────────────────
create table public.state (
  id                  int primary key default 1 check (id = 1),
  initial_capital     numeric not null,
  cash                numeric not null,
  holdings            jsonb not null default '{}'::jsonb,
  total_trades_today  int not null default 0,
  last_trade_time     timestamptz,
  today_date          date,
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger state_touch_updated_at
before update on public.state
for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────
-- action_history: AI + algo 판단 이력
-- ─────────────────────────────────────────────────
create table public.action_history (
  id                  bigserial primary key,
  ts                  timestamptz not null,
  source              text not null check (source in ('ai', 'algo')),
  actions             jsonb not null default '[]'::jsonb,
  market_summary      text,
  risk_assessment     text,
  per_coin            jsonb,
  conditions_checked  jsonb,
  triggers_next_cycle jsonb,
  has_non_hold        boolean default false
);

create index action_history_ts_desc_idx on public.action_history (ts desc);
create index action_history_source_idx on public.action_history (source, ts desc);
