import {
  fmt,
  fmtSummary,
  shortTime,
  signalClass,
  signalLabel,
  sourceBadge,
} from '../utils'
import type { Judgment, PerCoinSnapshot } from '../types'

interface Props {
  judgments: Judgment[]
}

export default function JudgmentHistory({ judgments }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-base font-semibold mb-4">AI Judgment History</h2>
      {judgments.length === 0 ? (
        <div className="text-gray-500 text-center py-8 text-sm">
          No judgments yet
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {judgments.map((j, i) => (
            <JudgmentRow key={i} j={j} />
          ))}
        </div>
      )}
    </div>
  )
}

function JudgmentRow({ j }: { j: Judgment }) {
  const src = sourceBadge(j.source)
  const hasActions = j.actions && j.actions.length > 0
  const perCoin = j.per_coin || {}
  const coins = Object.values(perCoin) as PerCoinSnapshot[]
  const hasStructured = coins.length > 0

  return (
    <details className="bg-slate-800 border border-slate-700 rounded-lg text-sm group">
      <summary className="p-3 cursor-pointer hover:bg-slate-800/80 list-none">
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-blue-400 font-semibold text-xs">
            {shortTime(j.timestamp)}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${src.cls}`}>
            {src.label}
          </span>

          {hasStructured ? (
            coins.map((c) => (
              <span
                key={c.coin}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${signalClass(c.signal)}`}
                title={`${c.coin}: ${signalLabel(c.signal)}`}
              >
                {c.coin} {signalLabel(c.signal)}
              </span>
            ))
          ) : hasActions ? (
            j.actions.map((a, ai) => (
              <span
                key={ai}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  a.action === 'buy'
                    ? 'bg-emerald-900/60 text-emerald-300'
                    : 'bg-red-900/60 text-red-300'
                }`}
              >
                {a.action.toUpperCase()} {(a.market || '').replace('KRW-', '')}{' '}
                {'\u20a9'}
                {fmt(a.amount_krw)}
              </span>
            ))
          ) : (
            <span className="text-gray-500 text-[10px]">HOLD</span>
          )}

          {hasActions && hasStructured && (
            <span className="text-emerald-300 text-[10px] font-semibold">
              · {j.actions.length} action{j.actions.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-1 truncate">
          {j.market_summary || '-'}
        </div>
      </summary>

      <div className="px-3 pb-3 border-t border-slate-700/60 text-xs space-y-2 pt-2">
        {j.risk_assessment && (
          <div className="text-yellow-400">Risk: {j.risk_assessment}</div>
        )}

        {hasActions && (
          <div className="space-y-1">
            {j.actions.map((a, i) => (
              <div key={i} className="text-gray-300">
                <span className="text-emerald-400">
                  {a.action.toUpperCase()}
                </span>{' '}
                {(a.market || '').replace('KRW-', '')}
                {a.amount_krw != null && ` ₩${fmt(a.amount_krw)}`}
                {a.sell_pct != null && ` × ${Math.round(a.sell_pct * 100)}%`}
                {a.reason && (
                  <div className="text-gray-500 ml-2">{a.reason}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {hasStructured && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
            {coins.map((c) => (
              <div
                key={c.coin}
                className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-1"
              >
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-200">{c.coin}</span>
                  <span
                    className={`text-[9px] px-1 rounded ${signalClass(c.signal)}`}
                  >
                    {signalLabel(c.signal)}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500">
                  RSI15m {c.rsi['15m']?.toFixed(1) ?? '-'} ·{' '}
                  {c.trend}
                </div>
              </div>
            ))}
          </div>
        )}

        {j.triggers_next_cycle && j.triggers_next_cycle.length > 0 && (
          <div>
            <div className="text-gray-500 mb-1">Triggers:</div>
            {j.triggers_next_cycle.map((t, i) => (
              <div key={i} className="text-gray-400 ml-2">
                <span className="font-semibold">{t.coin}</span> · {t.rule} —
                missing {t.missing.join(', ')}
              </div>
            ))}
          </div>
        )}

        {/* 구버전 폴백 */}
        {!hasStructured && (
          <div className="text-gray-400 whitespace-pre-line text-[11px] leading-relaxed">
            {fmtSummary(j.market_summary || '')}
          </div>
        )}
      </div>
    </details>
  )
}
