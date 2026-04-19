import { useEffect, useState } from 'react'
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceDot,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

interface EquityPoint { t: string; v: number; p: number }
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
  per_coin: CoinResult[]
}

const COINS = ['KRW-BTC', 'KRW-ETH', 'KRW-ADA']
const INTERVALS = ['day', 'minute240', 'minute60', 'minute30']
const INTERVAL_LABEL: Record<string, string> = {
  day: '1일', minute240: '4시간', minute60: '1시간', minute30: '30분',
}
const INTERVAL_COLOR: Record<string, string> = {
  day: '#60a5fa', minute240: '#f59e0b', minute60: '#10b981', minute30: '#a78bfa',
}

// 기본 룰 (CLAUDE.md v5)
const DEFAULT_RULE = {
  backstop_pct: -0.25,
  trailing_pct: -0.10,
  sell_strong_min_profit: 0.03,
  base_pct: 0.30,
  min_hold_minutes: 1440,
}

type IntervalKey = typeof INTERVALS[number]

const HORIZONS = [120, 240, 360] as const
type Horizon = typeof HORIZONS[number]

export default function ExplorerPage() {
  const [horizon, setHorizon] = useState<Horizon>(120)
  const [data, setData] = useState<Record<IntervalKey, BacktestResponse | null>>({
    day: null, minute240: null, minute60: null, minute30: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 인터벌별 표시 토글
  const [visible, setVisible] = useState<Record<IntervalKey, boolean>>({
    day: true, minute240: true, minute60: true, minute30: true,
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    Promise.all(
      INTERVALS.map((iv) =>
        fetch('/api/playground/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            interval: iv,
            coins: COINS,
            last_days: horizon,
            cycle_hours: iv === 'day' ? 24 : iv === 'minute240' ? 4 : iv === 'minute60' ? 1 : 0.5,
            rule: DEFAULT_RULE,
          }),
        }).then((r) => {
          if (!r.ok) throw new Error(`${iv} HTTP ${r.status}`)
          return r.json() as Promise<BacktestResponse>
        }),
      ),
    )
      .then((responses) => {
        if (cancelled) return
        const result: Record<IntervalKey, BacktestResponse | null> = {
          day: null, minute240: null, minute60: null, minute30: null,
        }
        INTERVALS.forEach((iv, i) => { result[iv] = responses[i] })
        setData(result)
      })
      .catch((e) => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [horizon])

  return (
    <main className="max-w-7xl mx-auto p-3 sm:p-6 space-y-6 pb-24">
      <Hero horizon={horizon} />

      <HorizonTabs horizon={horizon} setHorizon={setHorizon} loading={loading} />

      <Controls visible={visible} setVisible={setVisible} />

      {error && (
        <div className="bg-red-950/30 border border-red-700/40 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          {horizon}일 백테스트 실행 중… (3 코인 × 4 인터벌 = 12개 동시)
        </div>
      ) : (
        COINS.map((coin) => <CoinSection key={coin} coin={coin} data={data} visible={visible} />)
      )}
    </main>
  )
}

function Hero({ horizon }: { horizon: Horizon }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 sm:p-8">
      <div className="text-[11px] uppercase tracking-[0.24em] text-blue-400/80 font-semibold mb-2">
        Explorer · 동일 룰 × 4개 인터벌 비교
      </div>
      <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">{horizon}일 구간 — 언제 사고 팔았을까?</h1>
      <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-3xl">
        BTC / ETH / ADA 3 코인에 v5 룰(backstop -25%, trailing -10%, sell_strong 익절 +3%) 동일 적용.
        캔들 인터벌(1일/4시간/1시간/30분)만 바꿔가며 매매 시점·자산 추이 차이 확인.
        상단 <span className="text-slate-200">120일 / 240일 / 360일</span> 탭으로 구간 전환, 아래 토글로 특정 인터벌만 골라 볼 수 있습니다.
      </p>
    </section>
  )
}

function HorizonTabs({
  horizon,
  setHorizon,
  loading,
}: {
  horizon: Horizon
  setHorizon: (h: Horizon) => void
  loading: boolean
}) {
  return (
    <section className="flex gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1 w-fit">
      {HORIZONS.map((h) => (
        <button
          key={h}
          onClick={() => !loading && setHorizon(h)}
          disabled={loading && horizon !== h}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            horizon === h
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          {h}일
          {horizon === h && loading && <span className="ml-2 text-[10px] text-slate-500">로딩…</span>}
        </button>
      ))}
    </section>
  )
}

function Controls({
  visible,
  setVisible,
}: {
  visible: Record<IntervalKey, boolean>
  setVisible: (v: Record<IntervalKey, boolean>) => void
}) {
  return (
    <section className="sticky top-2 z-10 bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-3 sm:p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">인터벌 표시</span>
        {INTERVALS.map((iv) => {
          const on = visible[iv]
          return (
            <button
              key={iv}
              onClick={() => setVisible({ ...visible, [iv]: !on })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                on
                  ? 'text-white border-current'
                  : 'text-slate-500 border-slate-700 bg-slate-950/50'
              }`}
              style={on ? { borderColor: INTERVAL_COLOR[iv], background: `${INTERVAL_COLOR[iv]}22` } : undefined}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                style={{ background: on ? INTERVAL_COLOR[iv] : '#4b5563' }}
              />
              {INTERVAL_LABEL[iv]}
            </button>
          )
        })}
        <button
          onClick={() => setVisible({ day: true, minute240: true, minute60: true, minute30: true })}
          className="ml-auto text-xs text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
        >
          전체 보기
        </button>
        <button
          onClick={() => setVisible({ day: false, minute240: false, minute60: false, minute30: false })}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
        >
          전체 숨김
        </button>
      </div>
    </section>
  )
}

function CoinSection({
  coin,
  data,
  visible,
}: {
  coin: string
  data: Record<IntervalKey, BacktestResponse | null>
  visible: Record<IntervalKey, boolean>
}) {
  // 각 인터벌에서 해당 코인 결과 추출
  const perInterval = INTERVALS.map((iv) => ({
    interval: iv,
    res: data[iv]?.per_coin.find((c) => c.coin === coin) || null,
  }))

  // 가격 라인의 기준 — day 데이터 사용 (120 points)
  const priceRef = perInterval.find((p) => p.interval === 'day')?.res
  const priceCurve = priceRef?.equity_curve.map((p) => ({
    ts: new Date(p.t).getTime(),
    date: p.t.slice(0, 10),
    price: p.p,
  })) ?? []

  // 날짜(YYYY-MM-DD) → priceCurve의 ts(number) 매핑 (ReferenceDot x 스냅용)
  const dayTsMap = new Map(priceCurve.map((p) => [p.date, p.ts]))

  return (
    <section id={coin} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 sm:p-7 space-y-5 scroll-mt-20">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-1">Coin</div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">{coin.replace('KRW-', '')}</h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          {perInterval.map(({ interval, res }) => {
            if (!res || !visible[interval]) return null
            return (
              <div key={interval}
                   className="px-3 py-2 rounded-lg border text-xs tabular-nums"
                   style={{ borderColor: `${INTERVAL_COLOR[interval]}44`, background: `${INTERVAL_COLOR[interval]}14` }}>
                <span style={{ color: INTERVAL_COLOR[interval] }} className="font-semibold mr-2">{INTERVAL_LABEL[interval]}</span>
                <span className={res.pnl_pct >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {fmtPct(res.pnl_pct)}
                </span>
                <span className="text-slate-500 mx-1">·</span>
                <span className="text-slate-400">B{res.n_buys}/S{res.n_sells}</span>
              </div>
            )
          })}
        </div>
      </header>

      {/* 가격 차트 + 매수/매도 마커 */}
      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">가격 차트 (일봉 기준 120일) + 매매 시점</h3>
          <span className="text-[11px] text-slate-500">▲ 매수 ▽ 매도 · 색상 = 인터벌</span>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={priceCurve} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => {
                const d = new Date(v)
                return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
              }}
            />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false}
                   tickFormatter={(v) => v >= 100000000 ? `${(v / 100000000).toFixed(2)}억` : v >= 10000 ? `${(v / 10000).toFixed(0)}만` : v.toFixed(0)}
                   domain={['auto', 'auto']} />
            <Tooltip content={<CustomTooltip />}
                     labelFormatter={(v: any) => typeof v === 'number' ? new Date(v).toLocaleString('ko-KR') : String(v)} />
            <Line type="monotone" dataKey="price" stroke="#64748b" strokeWidth={1.5} dot={false} name="종가" isAnimationActive={false} />
            {perInterval.map(({ interval, res }) => {
              if (!res || !visible[interval]) return null
              return res.trades.map((tr, i) => {
                const snappedT = dayTsMap.get(tr.t.slice(0, 10))
                if (!snappedT) return null
                const isBuy = tr.action === 'buy'
                return (
                  <ReferenceDot
                    key={`${interval}-${i}`}
                    x={snappedT}
                    y={tr.price}
                    r={5}
                    fill={INTERVAL_COLOR[interval]}
                    fillOpacity={isBuy ? 0.85 : 0.25}
                    stroke={INTERVAL_COLOR[interval]}
                    strokeWidth={isBuy ? 0 : 2}
                  />
                )
              })
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 자산 평가액 추이 */}
      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">자산 평가액 추이 (초기 ₩10M)</h3>
          <span className="text-[11px] text-slate-500">인터벌별 독립 백테스트</span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => {
                const d = new Date(v)
                return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
              }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={<CustomTooltip />}
              labelFormatter={(v: any) => typeof v === 'number' ? new Date(v).toLocaleString('ko-KR') : String(v)}
            />
            <Legend />
            {perInterval.map(({ interval, res }) => {
              if (!res || !visible[interval]) return null
              const data = res.equity_curve.map((p) => ({
                ts: new Date(p.t).getTime(),
                [interval]: p.v,
              }))
              return (
                <Line
                  key={interval}
                  data={data}
                  type="monotone"
                  dataKey={interval}
                  stroke={INTERVAL_COLOR[interval]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  name={INTERVAL_LABEL[interval]}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 요약 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-slate-950/60 text-[10px] sm:text-xs text-slate-400 uppercase">
            <tr>
              <th className="text-left py-2 px-3">인터벌</th>
              <th className="text-right py-2 px-3">수익률</th>
              <th className="text-right py-2 px-3">홀딩</th>
              <th className="text-right py-2 px-3">MDD</th>
              <th className="text-right py-2 px-3">매수</th>
              <th className="text-right py-2 px-3">매도</th>
              <th className="text-right py-2 px-3">최종 ₩</th>
            </tr>
          </thead>
          <tbody>
            {perInterval.map(({ interval, res }) => {
              if (!res) return null
              return (
                <tr key={interval} className="border-t border-slate-800/60">
                  <td className="py-2 px-3 font-medium" style={{ color: INTERVAL_COLOR[interval] }}>
                    {INTERVAL_LABEL[interval]}
                  </td>
                  <td className={`py-2 px-3 text-right tabular-nums ${res.pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtPct(res.pnl_pct)}
                  </td>
                  <td className={`py-2 px-3 text-right tabular-nums ${res.hold_pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtPct(res.hold_pnl_pct)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-red-400">{fmtPct(res.max_dd_pct)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-400">{res.n_buys}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-400">{res.n_sells}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-200">{Math.round(res.final_krw).toLocaleString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
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
