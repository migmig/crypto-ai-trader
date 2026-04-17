import {
  fmt,
  fmtNum,
  signalClass,
  signalLabel,
  sourceBadge,
  timeAgo,
  trendColor,
} from '../utils'
import type {
  ConditionsForCoin,
  LastAction,
  PerCoinSnapshot,
  TriggerItem,
} from '../types'

interface Props {
  action: LastAction
}

export default function AIJudgment({ action }: Props) {
  if (!action.timestamp) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-base font-semibold mb-4">AI Judgment</h2>
        <div className="text-gray-500 text-center py-8">No judgment yet</div>
      </div>
    )
  }

  const src = sourceBadge(action.source)
  const perCoin = action.per_coin || {}
  const coins = Object.values(perCoin) as PerCoinSnapshot[]
  const conditions = action.conditions_checked || []
  const triggers = action.triggers_next_cycle || []
  const hasStructured =
    coins.length > 0 || conditions.length > 0 || triggers.length > 0

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">AI Judgment</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className={`px-2 py-0.5 rounded font-semibold ${src.cls}`}>
            {src.label}
          </span>
          <span className="text-gray-500">{timeAgo(action.timestamp)}</span>
        </div>
      </div>

      {/* 요약 & 리스크 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 text-sm">
        <div className="bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2">
          <div className="text-xs text-blue-400 font-semibold mb-1">Summary</div>
          <div className="text-gray-200 leading-relaxed">
            {action.market_summary || '-'}
          </div>
        </div>
        <div className="bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2">
          <div className="text-xs text-yellow-400 font-semibold mb-1">Risk</div>
          <div className="text-gray-200 leading-relaxed">
            {action.risk_assessment || '-'}
          </div>
        </div>
      </div>

      {/* Actions */}
      {action.actions.length > 0 ? (
        <div className="mb-4">
          <div className="text-xs text-blue-400 font-semibold mb-2">Actions</div>
          <div className="space-y-2">
            {action.actions.map((a, i) => (
              <div
                key={i}
                className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      a.action === 'buy'
                        ? 'bg-emerald-900/60 text-emerald-300'
                        : 'bg-red-900/60 text-red-300'
                    }`}
                  >
                    {a.action.toUpperCase()}
                  </span>
                  <span className="font-medium">
                    {(a.market || '').replace('KRW-', '')}
                  </span>
                  {a.amount_krw != null && (
                    <span className="text-gray-300">
                      {'\u20a9'}
                      {fmt(a.amount_krw)}
                    </span>
                  )}
                  {a.sell_pct != null && (
                    <span className="text-gray-300">
                      × {Math.round(a.sell_pct * 100)}%
                    </span>
                  )}
                </div>
                {a.reason && (
                  <div className="text-gray-400 text-xs leading-relaxed">
                    {a.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-4 text-sm text-gray-500 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2">
          No action — holding position
        </div>
      )}

      {/* 코인 카드 */}
      {coins.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-blue-400 font-semibold mb-2">
            Per-coin snapshot
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {coins.map((c) => (
              <CoinCard key={c.coin} c={c} />
            ))}
          </div>
        </div>
      )}

      {/* 트리거 */}
      {triggers.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-blue-400 font-semibold mb-2">
            Triggers to watch next cycle
          </div>
          <div className="space-y-1 text-xs">
            {triggers.map((t, i) => (
              <TriggerRow key={i} t={t} />
            ))}
          </div>
        </div>
      )}

      {/* 조건 매칭 상세 (접힘) */}
      {conditions.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-200">
            Rule evaluation details
          </summary>
          <div className="mt-2 space-y-3">
            {conditions.map((c) => (
              <ConditionBlock key={c.coin} c={c} />
            ))}
          </div>
        </details>
      )}

      {/* 구버전 폴백 */}
      {!hasStructured && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs text-gray-400 whitespace-pre-line leading-relaxed">
          {action.market_summary || ''}
        </div>
      )}
    </div>
  )
}

function CoinCard({ c }: { c: PerCoinSnapshot }) {
  const rsi15 = c.rsi['15m']
  const hist = c.macd_hist_15m
  const prev = c.macd_prev_hist_15m
  const vr = c.volume_ratio_15m
  const histDir =
    hist != null && prev != null
      ? hist > prev
        ? '↑'
        : hist < prev
          ? '↓'
          : '='
      : ''

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold">{c.coin}</span>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${signalClass(c.signal)}`}
        >
          {signalLabel(c.signal)}
        </span>
      </div>
      <div className="text-xs text-gray-400 mb-2">
        {c.price != null ? `₩${c.price.toLocaleString('ko-KR')}` : '-'}{' '}
        <span
          className={
            c.change_pct > 0
              ? 'text-emerald-400'
              : c.change_pct < 0
                ? 'text-red-400'
                : 'text-gray-400'
          }
        >
          ({c.change_pct >= 0 ? '+' : ''}
          {c.change_pct.toFixed(2)}%)
        </span>
        <span className={`ml-2 ${trendColor(c.trend)}`}>{c.trend}</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[11px]">
        <Stat label="RSI15m" value={rsi15 != null ? rsi15.toFixed(1) : '-'} />
        <Stat label="RSI1h" value={fmtNum(c.rsi['1h'], 1)} />
        <Stat label="RSI1d" value={fmtNum(c.rsi['1d'], 1)} />
        <Stat
          label="MACD15m"
          value={hist != null ? `${fmtNum(hist, 1)} ${histDir}` : '-'}
        />
        <Stat label="Vol×" value={vr != null ? vr.toFixed(2) : '-'} />
        <Stat
          label="Rule"
          value={c.matched_rule ? c.matched_rule.replace(' ', '\u00A0') : '-'}
        />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700/50 rounded px-1.5 py-1 text-center">
      <div className="text-[9px] text-gray-500 uppercase tracking-wide">
        {label}
      </div>
      <div className="text-gray-200 tabular-nums">{value}</div>
    </div>
  )
}

function TriggerRow({ t }: { t: TriggerItem }) {
  return (
    <div className="flex items-start gap-2 bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1.5">
      <span className="text-gray-400 font-mono text-[10px] mt-0.5">◇</span>
      <div className="flex-1">
        <span className="font-semibold text-gray-200">{t.coin}</span>{' '}
        <span className="text-gray-500">→ {t.rule}</span>
        <div className="text-gray-400 mt-0.5">
          {t.missing.map((m, i) => (
            <span key={i} className="inline-block mr-2">
              ✗ {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ConditionBlock({ c }: { c: ConditionsForCoin }) {
  return (
    <div className="bg-slate-900/40 border border-slate-700/50 rounded p-2 text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold">{c.coin}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${signalClass(c.signal)}`}>
          {signalLabel(c.signal)}
        </span>
      </div>
      <div className="space-y-1">
        {c.rules.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <span
              className={`text-[10px] font-semibold w-10 shrink-0 mt-0.5 ${
                r.matched ? 'text-emerald-400' : 'text-gray-500'
              }`}
            >
              {r.matched ? '✓' : '·'} {signalLabel(r.signal).slice(0, 4)}
            </span>
            <div className="flex-1 text-gray-400">
              {r.checks.map((ck, ci) => (
                <span
                  key={ci}
                  className={`inline-block mr-2 ${ck.ok ? 'text-emerald-400' : 'text-gray-500'}`}
                >
                  {ck.ok ? '✓' : '✗'} {ck.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
