import { useEffect, useState } from 'react'
import {
  CartesianGrid, Legend, Line, LineChart,
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
  hold_curve: EquityPoint[]
  dca_pnl_pct: number
  dca_curve: EquityPoint[]
  dca_invested: number
  equity_curve: EquityPoint[]
  trades: TradeEvent[]
}
interface BacktestResponse {
  interval: string
  per_coin: CoinResult[]
  avg_pnl_pct: number
  avg_max_dd_pct: number
  total_buys: number
  total_sells: number
}

const ALL_COINS = [
  'KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-ADA', 'KRW-SOL',
  'KRW-DOGE', 'KRW-AVAX', 'KRW-LINK', 'KRW-DOT', 'KRW-SUI',
]

const INTERVALS = ['day', 'minute240', 'minute60'] as const
const INTERVAL_LABEL: Record<string, string> = {
  day: '1일', minute240: '4시간', minute60: '1시간',
}

const DEFAULT_RULE = {
  backstop_pct: -0.25,
  trailing_pct: -0.10,
  sell_strong_min_profit: 0.03,
  base_pct: 0.30,
  min_hold_minutes: 1440,
}

const HORIZONS = [120, 240, 360] as const
type Horizon = typeof HORIZONS[number]

const NORMAL_COLOR = '#60a5fa'  // blue
const REVERSE_COLOR = '#f97316' // orange
const HOLD_COLOR = '#64748b'

export default function ReversePage() {
  const [horizon, setHorizon] = useState<Horizon>(240)
  const [interval, setInterval] = useState<string>('day')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [normal, setNormal] = useState<BacktestResponse | null>(null)
  const [reverse, setReverse] = useState<BacktestResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    const body = (rev: boolean) => JSON.stringify({
      interval,
      coins: ALL_COINS,
      last_days: horizon,
      cycle_hours: interval === 'day' ? 24 : interval === 'minute240' ? 4 : 1,
      rule: DEFAULT_RULE,
      reverse: rev,
    })

    Promise.all([
      fetch('/api/playground/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body(false),
      }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
      fetch('/api/playground/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body(true),
      }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
    ])
      .then(([n, rv]) => {
        if (cancelled) return
        setNormal(n)
        setReverse(rv)
      })
      .catch(e => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [horizon, interval])

  return (
    <main className="max-w-7xl mx-auto p-3 sm:p-6 space-y-6 pb-24">
      {/* Hero */}
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-orange-950/20 to-slate-950 p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.24em] text-orange-400/80 font-semibold mb-2">
          Reverse · 반대매매 시뮬레이션
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
          알고리즘이 틀렸다면? — 반대로 매매했을 때
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-3xl">
          알고리즘의 매수 신호를 매도로, 매도 신호를 매수로 뒤집어서 시뮬레이션합니다.
          <span className="text-blue-400"> 정상 매매</span>와
          <span className="text-orange-400"> 반대 매매</span>를 나란히 비교하여
          알고리즘의 방향성이 맞는지 검증합니다.
          {' '}손절(backstop/trailing)은 동일하게 적용됩니다.
        </p>
      </section>

      {/* Controls */}
      <section className="sticky top-2 z-10 bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold w-[56px]">구간</span>
          {HORIZONS.map(h => (
            <button
              key={h}
              onClick={() => !loading && setHorizon(h)}
              disabled={loading}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer disabled:opacity-50 ${
                horizon === h
                  ? 'text-white border-blue-500/40 bg-blue-600/20'
                  : 'text-slate-400 border-slate-700 hover:text-white hover:bg-slate-800'
              }`}
            >
              {h}일
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold w-[56px]">인터벌</span>
          {INTERVALS.map(iv => (
            <button
              key={iv}
              onClick={() => !loading && setInterval(iv)}
              disabled={loading}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer disabled:opacity-50 ${
                interval === iv
                  ? 'text-white border-blue-500/40 bg-blue-600/20'
                  : 'text-slate-400 border-slate-700 hover:text-white hover:bg-slate-800'
              }`}
            >
              {INTERVAL_LABEL[iv]}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="bg-red-950/30 border border-red-700/40 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          {horizon}일 × {INTERVAL_LABEL[interval]} 백테스트 실행 중… (정상 + 반대 = 20코인)
        </div>
      ) : normal && reverse && (
        <>
          {/* Summary comparison */}
          <SummaryCards normal={normal} reverse={reverse} />

          {/* Per-coin comparison table */}
          <ComparisonTable normal={normal} reverse={reverse} />

          {/* Per-coin charts */}
          {ALL_COINS.map(coin => {
            const nRes = normal.per_coin.find(c => c.coin === coin)
            const rRes = reverse.per_coin.find(c => c.coin === coin)
            if (!nRes || !rRes) return null
            return <CoinChart key={coin} coin={coin} normal={nRes} reverse={rRes} />
          })}
        </>
      )}
    </main>
  )
}

function SummaryCards({ normal, reverse }: { normal: BacktestResponse; reverse: BacktestResponse }) {
  const cards = [
    {
      label: '정상 평균 수익률',
      value: normal.avg_pnl_pct,
      color: NORMAL_COLOR,
      fmt: fmtPct,
    },
    {
      label: '반대 평균 수익률',
      value: reverse.avg_pnl_pct,
      color: REVERSE_COLOR,
      fmt: fmtPct,
    },
    {
      label: '정상 MDD',
      value: normal.avg_max_dd_pct,
      color: NORMAL_COLOR,
      fmt: fmtPct,
    },
    {
      label: '반대 MDD',
      value: reverse.avg_max_dd_pct,
      color: REVERSE_COLOR,
      fmt: fmtPct,
    },
  ]

  const winner = reverse.avg_pnl_pct > normal.avg_pnl_pct ? 'reverse' : 'normal'

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{c.label}</div>
            <div className="text-xl font-bold tabular-nums" style={{ color: c.color }}>
              {c.fmt(c.value)}
            </div>
          </div>
        ))}
      </div>
      <div className={`rounded-xl border p-4 text-sm font-medium ${
        winner === 'reverse'
          ? 'bg-orange-950/20 border-orange-700/40 text-orange-300'
          : 'bg-blue-950/20 border-blue-700/40 text-blue-300'
      }`}>
        {winner === 'reverse' ? (
          <>
            반대로 매매했을 때 수익률이 더 높습니다 ({fmtPct(reverse.avg_pnl_pct)} vs {fmtPct(normal.avg_pnl_pct)}).
            알고리즘의 방향성을 재검토할 필요가 있습니다.
          </>
        ) : (
          <>
            정상 매매가 반대 매매보다 낫습니다 ({fmtPct(normal.avg_pnl_pct)} vs {fmtPct(reverse.avg_pnl_pct)}).
            알고리즘이 올바른 방향을 잡고 있습니다.
          </>
        )}
      </div>
    </section>
  )
}

function ComparisonTable({ normal, reverse }: { normal: BacktestResponse; reverse: BacktestResponse }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 overflow-x-auto">
      <h2 className="text-sm font-semibold text-slate-200 mb-3">코인별 비교</h2>
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-slate-950/60 text-[10px] sm:text-xs text-slate-400 uppercase">
          <tr>
            <th className="text-left py-2 px-3">코인</th>
            <th className="text-right py-2 px-3">
              <span style={{ color: NORMAL_COLOR }}>정상</span> 수익률
            </th>
            <th className="text-right py-2 px-3">
              <span style={{ color: REVERSE_COLOR }}>반대</span> 수익률
            </th>
            <th className="text-right py-2 px-3">차이</th>
            <th className="text-right py-2 px-3">홀딩</th>
            <th className="text-right py-2 px-3">
              <span style={{ color: NORMAL_COLOR }}>정상</span> B/S
            </th>
            <th className="text-right py-2 px-3">
              <span style={{ color: REVERSE_COLOR }}>반대</span> B/S
            </th>
            <th className="text-right py-2 px-3">승자</th>
          </tr>
        </thead>
        <tbody>
          {ALL_COINS.map(coin => {
            const n = normal.per_coin.find(c => c.coin === coin)
            const r = reverse.per_coin.find(c => c.coin === coin)
            if (!n || !r) return null
            const diff = n.pnl_pct - r.pnl_pct
            const winner = n.pnl_pct >= r.pnl_pct ? 'normal' : 'reverse'
            return (
              <tr key={coin} className="border-t border-slate-800/60">
                <td className="py-2 px-3 font-medium text-slate-200">{coin.replace('KRW-', '')}</td>
                <td className={`py-2 px-3 text-right tabular-nums ${n.pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtPct(n.pnl_pct)}
                </td>
                <td className={`py-2 px-3 text-right tabular-nums ${r.pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtPct(r.pnl_pct)}
                </td>
                <td className={`py-2 px-3 text-right tabular-nums font-medium ${diff >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                  {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                </td>
                <td className={`py-2 px-3 text-right tabular-nums ${n.hold_pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtPct(n.hold_pnl_pct)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-400">
                  {n.n_buys}/{n.n_sells}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-400">
                  {r.n_buys}/{r.n_sells}
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    winner === 'normal'
                      ? 'bg-blue-900/40 text-blue-300'
                      : 'bg-orange-900/40 text-orange-300'
                  }`}>
                    {winner === 'normal' ? '정상' : '반대'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot className="border-t-2 border-slate-700 bg-slate-950/40">
          <tr>
            <td className="py-2 px-3 font-semibold text-slate-200">평균</td>
            <td className={`py-2 px-3 text-right tabular-nums font-semibold ${normal.avg_pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPct(normal.avg_pnl_pct)}
            </td>
            <td className={`py-2 px-3 text-right tabular-nums font-semibold ${reverse.avg_pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPct(reverse.avg_pnl_pct)}
            </td>
            <td className={`py-2 px-3 text-right tabular-nums font-semibold ${
              normal.avg_pnl_pct - reverse.avg_pnl_pct >= 0 ? 'text-blue-400' : 'text-orange-400'
            }`}>
              {(normal.avg_pnl_pct - reverse.avg_pnl_pct) >= 0 ? '+' : ''}
              {(normal.avg_pnl_pct - reverse.avg_pnl_pct).toFixed(2)}%p
            </td>
            <td className="py-2 px-3" />
            <td className="py-2 px-3 text-right tabular-nums text-slate-400">
              {normal.total_buys}/{normal.total_sells}
            </td>
            <td className="py-2 px-3 text-right tabular-nums text-slate-400">
              {reverse.total_buys}/{reverse.total_sells}
            </td>
            <td className="py-2 px-3 text-right">
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                normal.avg_pnl_pct >= reverse.avg_pnl_pct
                  ? 'bg-blue-900/40 text-blue-300'
                  : 'bg-orange-900/40 text-orange-300'
              }`}>
                {normal.avg_pnl_pct >= reverse.avg_pnl_pct ? '정상' : '반대'}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

function CoinChart({ coin, normal, reverse }: { coin: string; normal: CoinResult; reverse: CoinResult }) {
  // Merge equity curves for overlay
  const nData = normal.equity_curve.map(p => ({
    ts: new Date(p.t).getTime(),
    normal: p.v,
  }))
  const rData = reverse.equity_curve.map(p => ({
    ts: new Date(p.t).getTime(),
    reverse: p.v,
  }))
  const holdData = normal.hold_curve?.map(p => ({
    ts: new Date(p.t).getTime(),
    hold: p.v,
  })) ?? []

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 sm:p-7 space-y-4">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-1">Coin</div>
          <h2 className="text-xl font-bold text-white">{coin.replace('KRW-', '')}</h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="px-3 py-2 rounded-lg border text-xs tabular-nums"
               style={{ borderColor: `${NORMAL_COLOR}44`, background: `${NORMAL_COLOR}14` }}>
            <span style={{ color: NORMAL_COLOR }} className="font-semibold mr-2">정상</span>
            <span className={normal.pnl_pct >= 0 ? 'text-emerald-300' : 'text-red-300'}>
              {fmtPct(normal.pnl_pct)}
            </span>
          </div>
          <div className="px-3 py-2 rounded-lg border text-xs tabular-nums"
               style={{ borderColor: `${REVERSE_COLOR}44`, background: `${REVERSE_COLOR}14` }}>
            <span style={{ color: REVERSE_COLOR }} className="font-semibold mr-2">반대</span>
            <span className={reverse.pnl_pct >= 0 ? 'text-emerald-300' : 'text-red-300'}>
              {fmtPct(reverse.pnl_pct)}
            </span>
          </div>
          <div className="px-3 py-2 rounded-lg border border-slate-700/40 bg-slate-800/20 text-xs tabular-nums">
            <span style={{ color: HOLD_COLOR }} className="font-semibold mr-2">홀딩</span>
            <span className={normal.hold_pnl_pct >= 0 ? 'text-emerald-300' : 'text-red-300'}>
              {fmtPct(normal.hold_pnl_pct)}
            </span>
          </div>
        </div>
      </header>

      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">자산 평가액 추이 (초기 10M)</h3>
          <span className="text-[11px] text-slate-500">
            <span style={{ color: NORMAL_COLOR }}>-- 정상</span>
            {' · '}
            <span style={{ color: REVERSE_COLOR }}>-- 반대</span>
            {' · '}
            <span style={{ color: HOLD_COLOR }}>-- 홀딩</span>
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
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
              tickFormatter={v => `${(v / 10000).toFixed(0)}만`}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={<CustomTooltip />}
              labelFormatter={(v: any) => typeof v === 'number' ? new Date(v).toLocaleString('ko-KR') : String(v)}
            />
            <Legend />
            <Line
              data={nData}
              type="monotone"
              dataKey="normal"
              stroke={NORMAL_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name="정상 매매"
            />
            <Line
              data={rData}
              type="monotone"
              dataKey="reverse"
              stroke={REVERSE_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name="반대 매매"
            />
            <Line
              data={holdData}
              type="monotone"
              dataKey="hold"
              stroke={HOLD_COLOR}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
              name="Buy & Hold"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function CustomTooltip({ active, label, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-xl">
      {label !== undefined && (
        <div className="text-slate-400 mb-1">
          {typeof label === 'number' ? new Date(label).toLocaleDateString('ko-KR') : String(label)}
        </div>
      )}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-slate-100 tabular-nums ml-auto">
            {typeof p.value === 'number' ? Math.round(p.value).toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function fmtPct(n: number) {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}
