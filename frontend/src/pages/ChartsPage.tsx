import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts'
import type { PerfRecord, CoinChart } from '../types'
import { fmt } from '../utils'

interface Props {
  performance: PerfRecord[]
  markets: string[]
}

type Tab = 'portfolio' | 'coin'
type Range = '1h' | '6h' | '1d' | '3d' | '1w' | '1m' | 'all'
type CoinInterval = 'minute15' | 'minute30' | 'minute60' | 'minute240' | 'day'

const RANGE_MINUTES: Record<Range, number> = {
  '1h': 60,
  '6h': 360,
  '1d': 1440,
  '3d': 4320,
  '1w': 10080,
  '1m': 43200,
  'all': Infinity,
}

const COIN_INTERVAL_LABEL: Record<CoinInterval, string> = {
  minute15: '15분봉',
  minute30: '30분봉',
  minute60: '1시간봉',
  minute240: '4시간봉',
  day: '일봉',
}

export default function ChartsPage({ performance, markets }: Props) {
  const [searchParams] = useSearchParams()
  const coinParam = searchParams.get('coin')
  const [tab, setTab] = useState<Tab>(coinParam ? 'coin' : 'portfolio')

  useEffect(() => {
    if (coinParam) setTab('coin')
  }, [coinParam])

  return (
    <main className="max-w-7xl mx-auto p-3 sm:p-5 space-y-3 sm:space-y-5">
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        <TabBtn label="Portfolio" active={tab === 'portfolio'} onClick={() => setTab('portfolio')} />
        <TabBtn label="Per-Coin" active={tab === 'coin'} onClick={() => setTab('coin')} />
      </div>

      {tab === 'portfolio' ? (
        <PortfolioChart data={performance} />
      ) : (
        <CoinChartView markets={markets} initialMarket={coinParam || undefined} />
      )}
    </main>
  )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
        active
          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
          : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  )
}

// ────────────────────────────────────────────
// Portfolio
// ────────────────────────────────────────────
type PortfolioMode = 'total' | 'holdings'

function PortfolioChart({ data }: { data: PerfRecord[] }) {
  const [range, setRange] = useState<Range>('1d')
  const [mode, setMode] = useState<PortfolioMode>('total')

  const filtered = useMemo(() => {
    if (range === 'all') return data
    const cutoff = Date.now() - RANGE_MINUTES[range] * 60 * 1000
    return data.filter((d) => new Date(d.timestamp).getTime() >= cutoff)
  }, [data, range])

  const chartData = useMemo(() => {
    return filtered.map((p) => ({
      time: new Date(p.timestamp).getTime(),
      value: mode === 'total' ? Number(p.total_value) : Number(p.holdings_value),
    }))
  }, [filtered, mode])

  if (data.length === 0) {
    return <EmptyBox title="Portfolio" />
  }

  const initial = Number(data[0].total_value)
  const firstVal = chartData[0]?.value
  const lastVal = chartData[chartData.length - 1]?.value
  const periodPnl = firstVal && firstVal > 0 && lastVal !== undefined
    ? ((lastVal - firstVal) / firstVal) * 100
    : 0

  const stroke = mode === 'total' ? '#60a5fa' : '#f59e0b'
  const gradId = mode === 'total' ? 'portGradTotal' : 'portGradHoldings'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {mode === 'total' ? 'Portfolio Value' : 'Holdings Value'}
          </h2>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className="text-gray-500">{filtered.length} points</span>
            <span className={periodPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {range} change: {periodPnl >= 0 ? '+' : ''}{periodPnl.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            <ModeBtn label="전체" active={mode === 'total'} onClick={() => setMode('total')} />
            <ModeBtn label="보유코인" active={mode === 'holdings'} onClick={() => setMode('holdings')} />
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatTick(v, range)}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
            domain={mode === 'holdings' ? [0, 'dataMax + 50000'] : ['dataMin - 50000', 'dataMax + 50000']}
          />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#9ca3af' }}
            labelFormatter={(v: any) => new Date(v).toLocaleString('ko-KR')}
            formatter={(value: any) => [`\u20a9${Number(value).toLocaleString()}`, mode === 'total' ? 'Total' : 'Holdings']}
          />
          {mode === 'total' && (
            <ReferenceLine y={initial} stroke="#374151" strokeDasharray="4 4" />
          )}
          <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill={`url(#${gradId})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function ModeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
        active
          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
          : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  )
}

// ────────────────────────────────────────────
// Per-coin (단순 종가 라인)
// ────────────────────────────────────────────
function CoinChartView({ markets, initialMarket }: { markets: string[]; initialMarket?: string }) {
  const [selected, setSelected] = useState(initialMarket || markets[0] || 'KRW-BTC')

  useEffect(() => {
    if (initialMarket && initialMarket !== selected) setSelected(initialMarket)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMarket])
  const [intv, setIntv] = useState<CoinInterval>('minute60')
  const [count, setCount] = useState(200)
  const [data, setData] = useState<CoinChart | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/chart/coin/${selected}?interval=${intv}&count=${count}`)
      .then((r) => r.json())
      .then((d: CoinChart) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, intv, count])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-semibold">COIN</span>
          <div className="flex flex-wrap gap-1">
            {markets.map((m) => (
              <button
                key={m}
                onClick={() => setSelected(m)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  selected === m
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
                }`}
              >
                {m.replace('KRW-', '')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          <span className="text-xs text-gray-500 font-semibold">INTERVAL</span>
          <div className="flex gap-1">
            {(['minute15', 'minute30', 'minute60', 'minute240', 'day'] as CoinInterval[]).map((v) => (
              <button
                key={v}
                onClick={() => setIntv(v)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  intv === v
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
                }`}
              >
                {COIN_INTERVAL_LABEL[v]}
              </button>
            ))}
          </div>

          <span className="text-xs text-gray-500 font-semibold ml-3">N</span>
          <div className="flex gap-1">
            {[100, 200, 500].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  count === n
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        {loading && !data ? (
          <div className="py-16 text-center text-sm text-gray-500">Loading...</div>
        ) : !data || data.candles.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">No candle data</div>
        ) : (
          <PriceChart data={data} />
        )}
      </div>
    </div>
  )
}

function PriceChart({ data }: { data: CoinChart }) {
  const { candles, trades, market } = data

  const chartData = useMemo(
    () => candles.map((c) => ({ t: new Date(c.t).getTime(), price: c.c })),
    [candles],
  )

  const first = candles[0].c
  const last = candles[candles.length - 1].c
  const chg = (last / first - 1) * 100

  // 트레이드 마커 좌표 (가까운 캔들 시각에 스냅)
  const times = chartData.map((d) => d.t)
  const dots = trades
    .map((tr) => {
      const tt = new Date(tr.t).getTime()
      if (!times.length) return null
      let nearest = times[0]
      let diff = Math.abs(tt - times[0])
      for (const tm of times) {
        const d = Math.abs(tt - tm)
        if (d < diff) { diff = d; nearest = tm }
      }
      return { x: nearest, y: tr.price, action: tr.action }
    })
    .filter(Boolean) as { x: number; y: number; action: string }[]

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">
            {market.replace('KRW-', '')}
            <span className="text-gray-500 text-sm ml-2">/ KRW</span>
          </h2>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className="text-gray-300">₩{last.toLocaleString('ko-KR')}</span>
            <span className={chg >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {chg >= 0 ? '+' : ''}{chg.toFixed(2)}% · {candles.length} candles
            </span>
            {trades.length > 0 && (
              <span className="text-gray-500">
                · {trades.filter((t) => t.action === 'buy').length}B / {trades.filter((t) => t.action === 'sell').length}S
              </span>
            )}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: any) => formatTickAuto(v, data.interval)}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: any) => fmtAxisPrice(v)}
            domain={['dataMin', 'dataMax']}
          />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#9ca3af' }}
            labelFormatter={(v: any) => new Date(v).toLocaleString('ko-KR')}
            formatter={(value: any) => [`\u20a9${Number(value).toLocaleString()}`, 'Price']}
          />
          <Line
            dataKey="price"
            stroke={chg >= 0 ? '#10b981' : '#ef4444'}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {dots.map((d, i) => (
            <ReferenceDot
              key={i}
              x={d.x}
              y={d.y}
              r={5}
              fill={d.action === 'buy' ? '#10b981' : '#ef4444'}
              stroke="#fff"
              strokeWidth={1}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {trades.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="text-xs text-blue-400 font-semibold uppercase mb-2">
            Trades in view
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
            {trades
              .slice()
              .reverse()
              .map((t, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-2 py-1 rounded ${
                    t.action === 'buy' ? 'bg-emerald-900/20' : 'bg-red-900/20'
                  }`}
                >
                  <span
                    className={
                      t.action === 'buy'
                        ? 'text-emerald-400 font-bold w-10'
                        : 'text-red-400 font-bold w-10'
                    }
                  >
                    {t.action.toUpperCase()}
                  </span>
                  <span className="text-gray-400 w-36 font-mono">
                    {new Date(t.t).toLocaleString('ko-KR', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="text-gray-200">
                    ₩{t.price.toLocaleString('ko-KR')}
                  </span>
                  <span className="text-gray-500">× {t.qty.toFixed(6)}</span>
                  <span className="text-gray-400 ml-auto">₩{fmt(t.amount)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  )
}

function RangeSelector({ value, onChange }: { value: Range; onChange: (v: Range) => void }) {
  const ranges: Range[] = ['1h', '6h', '1d', '3d', '1w', '1m', 'all']
  return (
    <div className="flex gap-1">
      {ranges.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
            value === r
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
              : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

function EmptyBox({ title }: { title: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-base font-semibold mb-4">{title}</h2>
      <div className="text-gray-500 text-center py-8 text-sm">No data yet</div>
    </div>
  )
}

function formatTick(v: number, range: Range): string {
  const d = new Date(v)
  if (range === '1h' || range === '6h' || range === '1d' || range === '3d') {
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
}

function formatTickAuto(v: number, interval: string): string {
  const d = new Date(v)
  if (interval === 'day') {
    return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
  }
  if (interval === 'minute60' || interval === 'minute240') {
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit' })
  }
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function fmtAxisPrice(v: number): string {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`
  if (v >= 10000) return `${(v / 10000).toFixed(0)}만`
  if (v >= 1000) return `${(v / 1000).toFixed(0)}천`
  return v.toFixed(0)
}
