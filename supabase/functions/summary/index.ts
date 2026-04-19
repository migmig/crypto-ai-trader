// 일일 성과 요약 Edge Function.
// GET 으로 호출하면 최근 state / 오늘 거래 / 성과 스냅샷을 요약해 반환.
// 서비스 롤 키로 DB 쿼리 → 프런트는 anon 키 + 사용자 JWT 로 호출.

import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })

  try {
    // 1) 현재 state
    const { data: stateRows } = await admin.from("state").select("*").eq("id", 1).limit(1)
    const state = stateRows?.[0] ?? null

    // 2) 오늘 거래 (today_date 기준)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: todayTrades } = await admin
      .from("trade_log").select("*")
      .gte("ts", todayStart.toISOString())
      .order("ts", { ascending: false })

    // 3) 최근 성과 포인트 2개 (변화량 계산용)
    const { data: perfRows } = await admin
      .from("performance").select("*")
      .order("ts", { ascending: false }).limit(2)

    // 4) 최근 판단 1건
    const { data: lastActionRows } = await admin
      .from("action_history").select("ts, source, market_summary, risk_assessment, has_non_hold")
      .order("ts", { ascending: false }).limit(1)

    const buys = (todayTrades ?? []).filter((t: any) => t.action === "buy").length
    const sells = (todayTrades ?? []).filter((t: any) => t.action === "sell").length
    const latestPerf = perfRows?.[0] ?? null
    const prevPerf = perfRows?.[1] ?? null
    const deltaVsPrev = latestPerf && prevPerf
      ? Number(latestPerf.total_value) - Number(prevPerf.total_value)
      : null

    const body = {
      generated_at: new Date().toISOString(),
      state: state && {
        cash: Number(state.cash),
        initial_capital: Number(state.initial_capital),
        num_holdings: Object.keys(state.holdings ?? {}).length,
        last_trade_time: state.last_trade_time,
      },
      today: {
        buys, sells, total_trades: buys + sells,
        first_ts: todayTrades?.[todayTrades.length - 1]?.ts ?? null,
        last_ts: todayTrades?.[0]?.ts ?? null,
      },
      performance: latestPerf && {
        total_value: Number(latestPerf.total_value),
        pl_krw: Number(latestPerf.pl_krw),
        pl_pct: Number(latestPerf.pl_pct),
        delta_vs_prev: deltaVsPrev,
      },
      last_action: lastActionRows?.[0] ?? null,
    }

    return new Response(JSON.stringify(body), {
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    )
  }
})
