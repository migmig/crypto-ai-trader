import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fmt,
  fmtNum,
  signalClass,
  signalLabel,
  sourceBadge,
  trendColor,
} from '../utils'
import type {
  Judgment,
  PerCoinSnapshot,
  ConditionsForCoin,
} from '../types'

interface Props {
  judgments: Judgment[]
  total?: number
  hasMore?: boolean
  onLoadMore?: () => void | Promise<void>
}

type FilterSource = 'all' | 'ai' | 'algo'
type FilterSignal = 'all' | 'has_action' | 'hold_only'

export default function HistoryPage({ judgments, total, hasMore, onLoadMore }: Props) {
  const [searchParams] = useSearchParams()
  const highlightTs = searchParams.get('ts')
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)

  // IntersectionObserver: 하단 sentinel이 보이면 더 불러오기
  useEffect(() => {
    if (!hasMore || !onLoadMore) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current) {
          loadingRef.current = true
          Promise.resolve(onLoadMore()).finally(() => {
            loadingRef.current = false
          })
        }
      },
      { rootMargin: '300px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore, judgments.length])

  const [srcFilter, setSrcFilter] = useState<FilterSource>('all')
  const [sigFilter, setSigFilter] = useState<FilterSignal>('all')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(() => {
    if (highlightTs) {
      const idx = judgments.findIndex((j) => j.timestamp === highlightTs)
      return idx >= 0 ? idx : null
    }
    return null
  })

  const filtered = useMemo(() => {
    return judgments.filter((j) => {
      if (srcFilter !== 'all' && j.source !== srcFilter) return false
      const hasAction = j.actions && j.actions.length > 0
      if (sigFilter === 'has_action' && !hasAction) return false
      if (sigFilter === 'hold_only' && hasAction) return false
      return true
    })
  }, [judgments, srcFilter, sigFilter])

  // Stats (현재 로드된 기준)
  const loadedCount = judgments.length
  const aiCount = judgments.filter((j) => j.source === 'ai').length
  const algoCount = loadedCount - aiCount
  const actionCount = judgments.filter((j) => j.actions?.length > 0).length
  const serverTotal = total ?? loadedCount

  return (
    <main className="max-w-6xl mx-auto p-5 space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Judgments"
          value={serverTotal}
          subtext={loadedCount < serverTotal ? `loaded ${loadedCount}` : undefined}
        />
        <StatCard label="AI Calls" value={aiCount} accent="purple" />
        <StatCard label="Algo Only" value={algoCount} accent="slate" />
        <StatCard label="With Actions" value={actionCount} accent="emerald" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-gray-500 font-semibold uppercase">Filter</span>
        <div className="flex gap-1">
          {(['all', 'ai', 'algo'] as FilterSource[]).map((v) => (
            <button
              key={v}
              onClick={() => setSrcFilter(v)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                srcFilter === v
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
              }`}
            >
              {v === 'all' ? 'All Source' : v.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['all', 'has_action', 'hold_only'] as FilterSignal[]).map((v) => (
            <button
              key={v}
              onClick={() => setSigFilter(v)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                sigFilter === v
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
              }`}
            >
              {v === 'all' ? 'All Signals' : v === 'has_action' ? 'Actions Only' : 'Hold Only'}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto">
          {filtered.length} / {loadedCount}
        </span>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-gray-500 text-center py-16 text-sm">
            No judgments match the current filter
          </div>
        ) : (
          filtered.map((j) => {
            const realIdx = judgments.indexOf(j)
            const isExpanded = expandedIdx === realIdx
            const isHighlighted = j.timestamp === highlightTs
            return (
              <JudgmentCard
                key={realIdx}
                j={j}
                isExpanded={isExpanded}
                isHighlighted={isHighlighted}
                onToggle={() => setExpandedIdx(isExpanded ? null : realIdx)}
              />
            )
          })
        )}

        {/* 무한 스크롤 트리거 */}
        {hasMore && (
          <div ref={sentinelRef} className="py-6 text-center">
            <div className="inline-flex items-center gap-2 text-xs text-gray-500">
              <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
              Loading more... ({judgments.length} / {total})
            </div>
          </div>
        )}
        {!hasMore && judgments.length > 0 && filtered.length > 0 && (
          <div className="py-6 text-center text-xs text-gray-600">
            — end of history ({judgments.length} total) —
          </div>
        )}
      </div>
    </main>
  )
}

function StatCard({ label, value, accent = 'blue', subtext }: { label: string; value: number; accent?: string; subtext?: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    slate: 'text-gray-400',
    emerald: 'text-emerald-400',
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colors[accent]}`}>{value}</div>
      {subtext && <div className="text-[10px] text-gray-500 mt-0.5">{subtext}</div>}
    </div>
  )
}

function JudgmentCard({
  j,
  isExpanded,
  isHighlighted,
  onToggle,
}: {
  j: Judgment
  isExpanded: boolean
  isHighlighted: boolean
  onToggle: () => void
}) {
  const src = sourceBadge(j.source)
  const perCoin = j.per_coin || {}
  const coins = Object.values(perCoin) as PerCoinSnapshot[]
  const conditions = j.conditions_checked || []
  const triggers = j.triggers_next_cycle || []
  const hasActions = j.actions && j.actions.length > 0
  const ts = new Date(j.timestamp)

  return (
    <div
      className={`bg-gray-900 border rounded-xl transition ${
        isHighlighted
          ? 'border-blue-500/60 ring-1 ring-blue-500/30'
          : 'border-gray-800'
      }`}
    >
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-start gap-4 text-left cursor-pointer hover:bg-gray-800/40 transition rounded-xl"
      >
        {/* Time column */}
        <div className="shrink-0 w-20 text-center">
          <div className="text-xs text-gray-500">
            {ts.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
          </div>
          <div className="text-lg font-bold text-blue-400">
            {ts.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className={`mt-1 px-2 py-0.5 rounded text-[10px] font-semibold inline-block ${src.cls}`}>
            {src.label}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Signal badges */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {coins.length > 0 ? (
              coins.map((c) => (
                <span
                  key={c.coin}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${signalClass(c.signal)}`}
                >
                  {c.coin} {signalLabel(c.signal)}
                </span>
              ))
            ) : hasActions ? (
              j.actions.map((a, ai) => (
                <span
                  key={ai}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                    a.action === 'buy'
                      ? 'bg-emerald-900/60 text-emerald-300'
                      : 'bg-red-900/60 text-red-300'
                  }`}
                >
                  {a.action.toUpperCase()} {(a.market || '').replace('KRW-', '')}
                </span>
              ))
            ) : (
              <span className="text-gray-500 text-xs">ALL HOLD</span>
            )}
          </div>

          {/* Summary */}
          <div className="text-sm text-gray-300 truncate">
            {j.market_summary || '-'}
          </div>
          {j.risk_assessment && (
            <div className="text-xs text-yellow-500/80 mt-1">
              Risk: {j.risk_assessment}
            </div>
          )}
        </div>

        {/* Expand indicator */}
        <div className="shrink-0 text-gray-600 text-lg mt-1">
          {isExpanded ? '\u25B2' : '\u25BC'}
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-5 pb-5 border-t border-gray-800 pt-4 space-y-4">
          {/* Actions */}
          {hasActions && (
            <Section title="Actions">
              <div className="space-y-2">
                {j.actions.map((a, i) => (
                  <div
                    key={i}
                    className="bg-slate-800 border border-slate-700 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          a.action === 'buy'
                            ? 'bg-emerald-900/60 text-emerald-300'
                            : 'bg-red-900/60 text-red-300'
                        }`}
                      >
                        {a.action.toUpperCase()}
                      </span>
                      <span className="font-semibold text-sm">
                        {(a.market || '').replace('KRW-', '')}
                      </span>
                      {a.amount_krw != null && (
                        <span className="text-gray-300 text-sm">
                          {'\u20a9'}{fmt(a.amount_krw)}
                        </span>
                      )}
                      {a.sell_pct != null && (
                        <span className="text-gray-300 text-sm">
                          x {Math.round(a.sell_pct * 100)}%
                        </span>
                      )}
                    </div>
                    {a.reason && (
                      <div className="text-xs text-gray-400 leading-relaxed">{a.reason}</div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Per-coin grid */}
          {coins.length > 0 && (
            <Section title="Per-coin Snapshot">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {coins.map((c) => (
                  <CoinDetail key={c.coin} c={c} />
                ))}
              </div>
            </Section>
          )}

          {/* Conditions checked */}
          {conditions.length > 0 && (
            <Section title="Rule Evaluation">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {conditions.map((cond) => (
                  <ConditionDetail key={cond.coin} cond={cond} />
                ))}
              </div>
            </Section>
          )}

          {/* Triggers */}
          {triggers.length > 0 && (
            <Section title="Triggers (next cycle)">
              <div className="space-y-1">
                {triggers.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                    <span className="font-bold text-yellow-400">{t.coin}</span>
                    <span className="text-gray-400">{t.rule}</span>
                    <span className="text-gray-500">missing:</span>
                    {t.missing.map((m, mi) => (
                      <span key={mi} className="bg-red-900/30 text-red-300 px-1.5 py-0.5 rounded text-[10px]">
                        {m}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Raw summary fallback */}
          {coins.length === 0 && !hasActions && j.market_summary && (
            <Section title="Summary">
              <div className="text-sm text-gray-400 whitespace-pre-line leading-relaxed">
                {j.market_summary}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-blue-400 font-semibold uppercase tracking-wider mb-2">
        {title}
      </div>
      {children}
    </div>
  )
}

function CoinDetail({ c }: { c: PerCoinSnapshot }) {
  const rsi15 = c.rsi['15m']
  const rsi1h = c.rsi['1h']
  const rsi1d = c.rsi['1d']
  const hist = c.macd_hist_15m
  const prev = c.macd_prev_hist_15m
  const vr = c.volume_ratio_15m
  const histDir =
    hist != null && prev != null
      ? hist > prev ? '\u2191' : hist < prev ? '\u2193' : '='
      : ''

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm">{c.coin}</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${signalClass(c.signal)}`}>
          {signalLabel(c.signal)}
        </span>
      </div>
      <div className="text-xs text-gray-400 mb-2">
        {c.price != null ? `\u20a9${c.price.toLocaleString('ko-KR')}` : '-'}{' '}
        <span className={c.change_pct > 0 ? 'text-emerald-400' : c.change_pct < 0 ? 'text-red-400' : 'text-gray-400'}>
          ({c.change_pct >= 0 ? '+' : ''}{c.change_pct.toFixed(2)}%)
        </span>
        <span className={`ml-2 ${trendColor(c.trend)}`}>{c.trend}</span>
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[11px]">
        <Indicator label="RSI 15m" value={fmtNum(rsi15, 1)} warn={rsi15 != null && (rsi15 <= 30 || rsi15 >= 70)} />
        <Indicator label="RSI 1h" value={fmtNum(rsi1h, 1)} />
        <Indicator label="RSI 1d" value={fmtNum(rsi1d, 1)} warn={rsi1d != null && rsi1d >= 65} />
        <Indicator label="MACD" value={hist != null ? `${fmtNum(hist, 0)} ${histDir}` : '-'} />
        <Indicator label="Vol x" value={vr != null ? vr.toFixed(2) : '-'} warn={vr != null && vr >= 1.3} good />
        <Indicator label="BB" value={
          c.bb_15m.lower != null && c.price != null
            ? c.price <= c.bb_15m.lower * 1.02 ? 'Near Low' : c.price >= (c.bb_15m.upper ?? Infinity) * 0.98 ? 'Near High' : 'Mid'
            : '-'
        } />
      </div>
      {c.matched_rule && (
        <div className="mt-2 text-[10px] text-yellow-400 bg-yellow-900/20 border border-yellow-800/40 rounded px-2 py-1">
          Matched: {c.matched_rule}
        </div>
      )}
    </div>
  )
}

function Indicator({ label, value, warn, good }: { label: string; value: string; warn?: boolean; good?: boolean }) {
  return (
    <div>
      <div className="text-gray-500">{label}</div>
      <div className={`font-medium ${warn ? (good ? 'text-emerald-400' : 'text-yellow-400') : 'text-gray-300'}`}>
        {value}
      </div>
    </div>
  )
}

function ConditionDetail({ cond }: { cond: ConditionsForCoin }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm">{cond.coin}</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${signalClass(cond.signal)}`}>
          {signalLabel(cond.signal)}
        </span>
      </div>
      <div className="space-y-2">
        {cond.rules.map((r) => (
          <div key={r.rule} className={`rounded-lg px-2.5 py-2 text-xs ${
            r.matched
              ? 'bg-emerald-900/20 border border-emerald-800/40'
              : 'bg-slate-900/60 border border-slate-700/60'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={r.matched ? 'text-emerald-400 font-bold' : 'text-gray-400'}>
                {r.matched ? '\u2713' : '\u2717'} {r.rule}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {r.checks.map((ch) => (
                <span
                  key={ch.name}
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    ch.ok
                      ? 'bg-emerald-900/40 text-emerald-300'
                      : 'bg-red-900/30 text-red-400'
                  }`}
                >
                  {ch.ok ? '\u2713' : '\u2717'} {ch.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
