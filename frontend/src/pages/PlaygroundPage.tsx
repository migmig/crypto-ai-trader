import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

interface IntervalInfo {
  interval: string
  minutes: number
  coins: string[]
  ranges: Record<string, [string, string]>
  counts: Record<string, number>
}

interface EquityPoint { t: string; v: number }
interface TradeEvent { t: string; action: string; price: number; qty: number; reason: string }
interface CoinResult {
  coin: string
  pnl_pct: number
  max_dd_pct: number
  n_buys: number
  n_sells: number
  final_krw: number
  hold_pnl_pct: number
  equity_curve: EquityPoint[]
  trades: TradeEvent[]
}
interface BacktestResponse {
  interval: string
  cycle_hours: number
  per_coin: CoinResult[]
  avg_pnl_pct: number
  avg_max_dd_pct: number
  total_buys: number
  total_sells: number
}

const INTERVAL_LABEL: Record<string, string> = {
  minute15: '15분', minute30: '30분', minute60: '1시간', minute240: '4시간', day: '1일',
}

export default function PlaygroundPage() {
  const [meta, setMeta] = useState<IntervalInfo[]>([])
  const [metaErr, setMetaErr] = useState<string>('')
  const [interval, setInterval] = useState('day')
  const [lastDays, setLastDays] = useState(720)
  const [cycleHours, setCycleHours] = useState(8)
  const [backstop, setBackstop] = useState(-0.25)
  const [trailing, setTrailing] = useState(-0.10)
  const [minProfit, setMinProfit] = useState(0.03)
  const [basePct, setBasePct] = useState(0.30)
  const [minHoldMinutes, setMinHoldMinutes] = useState(1440)
  const [selectedCoins, setSelectedCoins] = useState<string[]>([])
  const [result, setResult] = useState<BacktestResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [autoRun, setAutoRun] = useState(true)

  useEffect(() => {
    fetch('/api/playground/meta')
      .then((r) => { if (!r.ok) throw new Error('meta fetch failed'); return r.json() })
      .then((m: IntervalInfo[]) => { setMeta(m); setMetaErr('') })
      .catch((e) => setMetaErr(String(e)))
  }, [])

  const currentMeta = useMemo(() => meta.find((m) => m.interval === interval), [meta, interval])

  // 인터벌 변경 시 가능한 last_days 최대치 자동 조정
  useEffect(() => {
    if (!currentMeta) return
    const minCount = Math.min(...Object.values(currentMeta.counts))
    const candlesPerDay = 1440 / currentMeta.minutes
    const maxDays = Math.floor(minCount / candlesPerDay) - 5
    if (lastDays > maxDays) setLastDays(Math.max(30, maxDays))
    if (cycleHours < currentMeta.minutes / 60) setCycleHours(currentMeta.minutes / 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMeta])

  const runBacktest = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/playground/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interval,
          coins: selectedCoins,
          last_days: lastDays,
          cycle_hours: cycleHours,
          rule: {
            backstop_pct: backstop,
            trailing_pct: trailing,
            sell_strong_min_profit: minProfit,
            base_pct: basePct,
            min_hold_minutes: minHoldMinutes,
          },
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data: BacktestResponse = await r.json()
      setResult(data)
    } catch (e: any) {
      setError(String(e))
    } finally { setLoading(false) }
  }

  // 자동 실행 (디바운스)
  useEffect(() => {
    if (!autoRun || meta.length === 0) return
    const h = setTimeout(runBacktest, 300)
    return () => clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, interval, lastDays, cycleHours, backstop, trailing, minProfit, basePct, minHoldMinutes, selectedCoins, meta])

  if (metaErr) {
    return (
      <main className="max-w-7xl mx-auto p-5">
        <div className="bg-red-950/30 border border-red-700/40 rounded-xl p-4 text-sm text-red-300">
          Playground 서버 연결 실패: {metaErr}
          <div className="text-xs text-slate-400 mt-2">
            <code>launchctl list | grep playground</code> 로 서버 상태 확인하세요.
          </div>
        </div>
      </main>
    )
  }

  const allCoins = currentMeta?.coins ?? []
  const activeCoins = selectedCoins.length === 0 ? allCoins : selectedCoins
  const perCoinData = result?.per_coin.filter((c) => activeCoins.includes(c.coin)) ?? []

  return (
    <main className="max-w-7xl mx-auto p-3 sm:p-6 space-y-5">
      <section className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6">
        <div className="text-[11px] uppercase tracking-[0.24em] text-blue-400/80 font-semibold mb-2">
          Playground · 인터랙티브 백테스트
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">룰 / 기간 / 주기를 바로 돌려보기</h1>
        <p className="text-xs sm:text-sm text-slate-400">
          미리 캐시된 캔들 데이터를 Go 서버가 메모리에 올려둔 상태. 파라미터 변경 시 자동 재실행(~수십 ms).
        </p>
      </section>

      {/* 컨트롤 패널 */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm font-semibold text-slate-200">파라미터</div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
              <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} className="accent-blue-500" />
              자동 실행
            </label>
            {!autoRun && (
              <button
                onClick={runBacktest}
                disabled={loading}
                className="bg-blue-600/20 border border-blue-500/40 text-blue-300 px-3 py-1.5 rounded-lg text-sm hover:bg-blue-600/30 transition disabled:opacity-50"
              >
                {loading ? '실행 중…' : 'Run Backtest'}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label="Interval (신호·체결 기준 봉)" hint="데이터 확보 여부에 따라 선택지 제한">
            <div className="flex flex-wrap gap-1">
              {meta.map((m) => (
                <button
                  key={m.interval}
                  onClick={() => setInterval(m.interval)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                    interval === m.interval
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {INTERVAL_LABEL[m.interval] ?? m.interval}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Last Days · ${lastDays}일`} hint={`최대 ${currentMeta ? Math.floor(Math.min(...Object.values(currentMeta.counts)) / (1440 / currentMeta.minutes)) : '?'}일`}>
            <input
              type="range" min={30}
              max={currentMeta ? Math.floor(Math.min(...Object.values(currentMeta.counts)) / (1440 / currentMeta.minutes)) - 5 : 720}
              step={10} value={lastDays}
              onChange={(e) => setLastDays(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </Field>

          <Field label={`Cycle · ${formatHours(cycleHours)}`} hint="체크 주기. 인터벌 이상만 가능">
            <input
              type="range"
              min={currentMeta ? currentMeta.minutes / 60 : 0.25}
              max={72} step={0.25}
              value={cycleHours}
              onChange={(e) => setCycleHours(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </Field>

          <Field label={`Backstop · ${(backstop * 100).toFixed(0)}%`} hint="평단 대비 X% 하락 시 전량 매도">
            <input type="range" min={-0.40} max={-0.05} step={0.01} value={backstop}
              onChange={(e) => setBackstop(Number(e.target.value))}
              className="w-full accent-red-500" />
          </Field>

          <Field label={`Trailing · ${(trailing * 100).toFixed(0)}%`} hint="고점 대비 X% 하락 시 매도 (수익 구간 한정)">
            <input type="range" min={-0.20} max={-0.02} step={0.005} value={trailing}
              onChange={(e) => setTrailing(Number(e.target.value))}
              className="w-full accent-amber-500" />
          </Field>

          <Field label={`Sell Strong 익절 조건 · +${(minProfit * 100).toFixed(0)}%`} hint="이 이상 수익일 때만 sell 발동">
            <input type="range" min={0} max={0.15} step={0.005} value={minProfit}
              onChange={(e) => setMinProfit(Number(e.target.value))}
              className="w-full accent-emerald-500" />
          </Field>

          <Field label={`Base Pct · ${(basePct * 100).toFixed(0)}%`} hint="buy_strong 시 평가금액 대비 매수 비율">
            <input type="range" min={0.10} max={0.50} step={0.05} value={basePct}
              onChange={(e) => setBasePct(Number(e.target.value))}
              className="w-full accent-blue-500" />
          </Field>

          <Field label={`Min Hold · ${formatMinutes(minHoldMinutes)}`} hint="매수/매도 후 다음 거래까지 최소 대기">
            <input type="range" min={0} max={2880} step={60} value={minHoldMinutes}
              onChange={(e) => setMinHoldMinutes(Number(e.target.value))}
              className="w-full accent-purple-500" />
          </Field>

          <Field label={`Coins · ${selectedCoins.length === 0 ? '전체 ' + allCoins.length : selectedCoins.length}`} hint="미선택 시 전체">
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {allCoins.map((c) => {
                const active = selectedCoins.includes(c)
                return (
                  <button
                    key={c}
                    onClick={() => setSelectedCoins((prev) => active ? prev.filter((x) => x !== c) : [...prev, c])}
                    className={`px-2 py-0.5 rounded text-[11px] border transition cursor-pointer ${
                      active
                        ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {c.replace('KRW-', '')}
                  </button>
                )
              })}
              {selectedCoins.length > 0 && (
                <button
                  onClick={() => setSelectedCoins([])}
                  className="px-2 py-0.5 rounded text-[11px] border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
                >전체</button>
              )}
            </div>
          </Field>
        </div>
      </section>

      {/* 결과 */}
      {error && (
        <section className="bg-red-950/30 border border-red-700/40 rounded-xl p-4 text-sm text-red-300">
          에러: {error}
        </section>
      )}

      {result && (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="평균 수익률" value={fmtPct(result.avg_pnl_pct)} tone={result.avg_pnl_pct >= 0 ? 'pos' : 'neg'} />
            <Stat label="평균 최대 낙폭" value={fmtPct(result.avg_max_dd_pct)} tone="neg" />
            <Stat label="총 매수" value={`${result.total_buys}회`} />
            <Stat label="총 매도" value={`${result.total_sells}회`} />
          </section>

          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">코인별 수익률</h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={perCoinData.map((c) => ({
                name: c.coin.replace('KRW-', ''),
                pnl: c.pnl_pct,
                hold: c.hold_pnl_pct,
              }))} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="hold" name="단순 홀딩" fill="#64748b" radius={[6, 6, 0, 0]} />
                <Bar dataKey="pnl" name="룰 적용 P&L" radius={[6, 6, 0, 0]}>
                  {perCoinData.map((c) => (
                    <Cell key={c.coin} fill={c.pnl_pct >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-slate-200">총 평가액 추이 (코인별)</h2>
              <span className="text-xs text-slate-500">초기 ₩10,000,000</span>
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
                <defs>
                  {perCoinData.map((c, i) => (
                    <linearGradient key={c.coin} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="t" type="category" allowDuplicatedCategory={false}
                       tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                       tickFormatter={(v: string) => v.slice(0, 10)} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false}
                       tickFormatter={(v) => `${(v / 10_000).toFixed(0)}만`} domain={['auto', 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {perCoinData.map((c, i) => (
                  <Area key={c.coin} type="monotone" data={c.equity_curve.map((p) => ({ t: p.t, [c.coin]: p.v }))}
                        dataKey={c.coin} stroke={COLORS[i % COLORS.length]} fill={`url(#grad${i})`}
                        strokeWidth={2} dot={false} name={c.coin.replace('KRW-', '')} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </section>

          {/* 상세 테이블 */}
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 text-sm font-semibold text-slate-200 border-b border-slate-800">코인별 상세</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-slate-950/60 text-[10px] sm:text-xs text-slate-400 uppercase">
                  <tr>
                    <th className="text-left py-2 px-3">코인</th>
                    <th className="text-right py-2 px-3">룰 P&L</th>
                    <th className="text-right py-2 px-3">홀딩</th>
                    <th className="text-right py-2 px-3">MDD</th>
                    <th className="text-right py-2 px-3">매수</th>
                    <th className="text-right py-2 px-3">매도</th>
                    <th className="text-right py-2 px-3">최종 ₩</th>
                  </tr>
                </thead>
                <tbody>
                  {perCoinData.map((c) => (
                    <tr key={c.coin} className="border-t border-slate-800/60 hover:bg-slate-900/60">
                      <td className="py-2 px-3 font-medium text-slate-100">{c.coin.replace('KRW-', '')}</td>
                      <td className={`py-2 px-3 text-right tabular-nums ${c.pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(c.pnl_pct)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums ${c.hold_pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(c.hold_pnl_pct)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-red-400">{fmtPct(c.max_dd_pct)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-400">{c.n_buys}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-400">{c.n_sells}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-200">{Math.round(c.final_krw).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

const COLORS = ['#60a5fa', '#f59e0b', '#10b981', '#ef4444', '#a78bfa', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4']

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-semibold text-slate-200">{label}</div>
        {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  const color = tone === 'pos' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5'
    : tone === 'neg' ? 'text-red-300 border-red-500/30 bg-red-500/5'
    : 'text-slate-200 border-slate-700 bg-slate-950/60'
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-2">{label}</div>
      <div className="text-lg sm:text-xl font-semibold text-white tabular-nums">{value}</div>
    </div>
  )
}

function CustomTooltip({ active, label, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-xl">
      {label !== undefined && <div className="text-slate-400 mb-1">{typeof label === 'string' ? label.slice(0, 16) : label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-slate-100 tabular-nums ml-auto">
            {typeof p.value === 'number'
              ? (Math.abs(p.value) > 1000 ? Math.round(p.value).toLocaleString() : p.value.toFixed(2))
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function fmtPct(n: number) {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)}분`
  if (h < 24) return `${h.toFixed(h % 1 === 0 ? 0 : 2)}시간`
  return `${(h / 24).toFixed(h % 24 === 0 ? 0 : 1)}일`
}

function formatMinutes(m: number) {
  if (m === 0) return '없음'
  if (m < 60) return `${m}분`
  if (m < 1440) return `${(m / 60).toFixed(0)}시간`
  return `${(m / 1440).toFixed(0)}일`
}
