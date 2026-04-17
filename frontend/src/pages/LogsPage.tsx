import { useState, useMemo } from 'react'
import type { CycleLog } from '../types'

interface Props {
  logs: CycleLog[]
}

type TagFilter = 'all' | 'AI' | 'TRADE' | 'HOLD' | 'TRAILING' | 'STOPLOSS' | 'error'

const TAG_COLORS: Record<string, string> = {
  AI: 'bg-purple-900/50 text-purple-300 border-purple-800',
  TRADE: 'bg-emerald-900/50 text-emerald-300 border-emerald-800',
  HOLD: 'bg-slate-700 text-gray-300 border-slate-600',
  TRAILING: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  STOPLOSS: 'bg-red-900/50 text-red-300 border-red-800',
}

const STATUS_ICON: Record<string, string> = {
  ok: '\u2705',
  error: '\u274C',
  running: '\u23F3',
}

export default function LogsPage({ logs }: Props) {
  const [filter, setFilter] = useState<TagFilter>('all')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (filter === 'error') return l.status === 'error'
      if (filter !== 'all' && !l.tags.includes(filter)) return false
      if (search && !l.body.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [logs, filter, search])

  // Stats
  const total = logs.length
  const errCount = logs.filter((l) => l.status === 'error').length
  const aiCount = logs.filter((l) => l.tags.includes('AI')).length
  const tradeCount = logs.filter((l) => l.tags.includes('TRADE')).length
  const trailCount = logs.filter((l) => l.tags.includes('TRAILING')).length

  return (
    <main className="max-w-6xl mx-auto p-5 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total Cycles" value={total} />
        <StatCard label="AI Calls" value={aiCount} accent="purple" />
        <StatCard label="Trades" value={tradeCount} accent="emerald" />
        <StatCard label="Trailing Stops" value={trailCount} accent="yellow" />
        <StatCard label="Errors" value={errCount} accent="red" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-gray-500 font-semibold uppercase">Filter</span>
        <div className="flex gap-1">
          {(['all', 'AI', 'TRADE', 'HOLD', 'TRAILING', 'STOPLOSS', 'error'] as TagFilter[]).map((v) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                filter === v
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
              }`}
            >
              {v === 'all' ? 'All' : v === 'error' ? 'Errors' : v}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search logs..."
          className="ml-auto bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-48"
        />

        <span className="text-xs text-gray-500">
          {filtered.length} / {total}
        </span>
      </div>

      {/* Log list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-gray-500 text-center py-16 text-sm">
            No logs match the current filter
          </div>
        ) : (
          filtered.map((l, i) => (
            <LogCard
              key={`${l.timestamp}-${i}`}
              log={l}
              isExpanded={expandedIdx === i}
              onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            />
          ))
        )}
      </div>
    </main>
  )
}

function StatCard({ label, value, accent = 'blue' }: { label: string; value: number; accent?: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    emerald: 'text-emerald-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colors[accent]}`}>{value}</div>
    </div>
  )
}

function LogCard({ log, isExpanded, onToggle }: { log: CycleLog; isExpanded: boolean; onToggle: () => void }) {
  // Extract key info from body
  const lines = log.body.split('\n')
  const simBuy = lines.filter((l) => l.includes('[SIM 매수]'))
  const simSell = lines.filter((l) => l.includes('[SIM 매도]'))
  const errors = lines.filter((l) => l.includes('[ERROR]') || l.includes('Traceback'))
  const signals = lines.filter((l) => l.match(/^\s{2}\w+: (buy|sell|hold)/))
  const totalLine = lines.find((l) => l.includes('총 평가:'))

  return (
    <div className={`bg-gray-900 border rounded-xl transition ${
      log.status === 'error' ? 'border-red-800/60' : 'border-gray-800'
    }`}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-left cursor-pointer hover:bg-gray-800/40 transition rounded-xl"
      >
        {/* Status icon */}
        <span className="text-base shrink-0">{STATUS_ICON[log.status] || '?'}</span>

        {/* Timestamp */}
        <span className="text-sm font-mono text-blue-400 shrink-0 w-40">
          {log.timestamp}
        </span>

        {/* Tags */}
        <div className="flex gap-1 shrink-0">
          {log.tags.map((t) => (
            <span
              key={t}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${TAG_COLORS[t] || 'bg-gray-800 text-gray-400 border-gray-700'}`}
            >
              {t}
            </span>
          ))}
        </div>

        {/* Quick summary */}
        <div className="flex-1 min-w-0 text-xs text-gray-400 truncate">
          {simBuy.length > 0 && <span className="text-emerald-400 mr-2">BUY x{simBuy.length}</span>}
          {simSell.length > 0 && <span className="text-red-400 mr-2">SELL x{simSell.length}</span>}
          {totalLine && <span className="text-gray-300">{totalLine.trim()}</span>}
          {errors.length > 0 && <span className="text-red-400">ERROR x{errors.length}</span>}
          {!simBuy.length && !simSell.length && !errors.length && !totalLine && (
            <span>{log.line_count} lines</span>
          )}
        </div>

        <span className="shrink-0 text-gray-600 text-sm">
          {isExpanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-3">
          {/* Signal summary */}
          {signals.length > 0 && (
            <div>
              <div className="text-xs text-blue-400 font-semibold uppercase mb-1">Signals</div>
              <div className="flex flex-wrap gap-1">
                {signals.map((s, i) => {
                  const trimmed = s.trim()
                  const isBuy = trimmed.includes('buy')
                  const isSell = trimmed.includes('sell')
                  return (
                    <span
                      key={i}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                        isBuy
                          ? 'bg-emerald-900/40 text-emerald-300'
                          : isSell
                            ? 'bg-red-900/40 text-red-300'
                            : 'bg-slate-800 text-gray-400'
                      }`}
                    >
                      {trimmed}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Trade lines */}
          {(simBuy.length > 0 || simSell.length > 0) && (
            <div>
              <div className="text-xs text-blue-400 font-semibold uppercase mb-1">Trades</div>
              <div className="space-y-1">
                {[...simBuy, ...simSell].map((l, i) => (
                  <div
                    key={i}
                    className={`text-xs font-mono px-2 py-1 rounded ${
                      l.includes('매수') ? 'bg-emerald-900/20 text-emerald-300' : 'bg-red-900/20 text-red-300'
                    }`}
                  >
                    {l.trim()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full log */}
          <div>
            <div className="text-xs text-blue-400 font-semibold uppercase mb-1">
              Full Log ({log.line_count} lines)
            </div>
            <pre className="bg-[#0d1117] border border-gray-800 rounded-lg p-3 text-[11px] text-gray-400 font-mono overflow-x-auto max-h-96 overflow-y-auto leading-relaxed whitespace-pre-wrap">
              {log.body}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
