-- Phase 2: Realtime 활성화
-- supabase_realtime publication 에 테이블 추가 → 클라이언트가 postgres_changes 이벤트 구독 가능.

alter publication supabase_realtime add table public.trade_log;
alter publication supabase_realtime add table public.performance;
alter publication supabase_realtime add table public.action_history;

-- state 는 단일 행 upsert라 변화 빈번함 → 대시보드 즉시 반영에 유리
alter publication supabase_realtime add table public.state;
