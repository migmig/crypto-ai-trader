import { fmt, shortTime } from '../utils'
import type { Trade } from '../types'

interface Props {
  trades: Trade[]
}

export default function RecentTrades({ trades }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-5">
      <h2 className="text-base font-semibold mb-4">Recent Trades</h2>
      {trades.length === 0 ? (
        <div className="text-gray-500 text-center py-8 text-sm">No trades yet</div>
      ) : (
        <>
          {/* Desktop: 테이블 */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                  <th className="text-left py-2.5 px-3">Time</th>
                  <th className="text-left py-2.5 px-3">Action</th>
                  <th className="text-left py-2.5 px-3">Market</th>
                  <th className="text-right py-2.5 px-3">Amount</th>
                  <th className="text-right py-2.5 px-3">Price</th>
                  <th className="text-left py-2.5 px-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/40 transition">
                    <td className="py-2.5 px-3 text-gray-400">{shortTime(t.timestamp)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        t.action === 'buy' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
                      }`}>
                        {t.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">{(t.market || '').replace('KRW-', '')}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{'\u20a9'}{fmt(Number(t.amount_krw))}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{'\u20a9'}{fmt(Number(t.price))}</td>
                    <td className="py-2.5 px-3 text-xs text-gray-400">{t.result || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: 카드 리스트 */}
          <div className="sm:hidden space-y-2">
            {trades.map((t, i) => (
              <div
                key={i}
                className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    t.action === 'buy' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
                  }`}>
                    {t.action.toUpperCase()}
                  </span>
                  <span className="font-semibold">{(t.market || '').replace('KRW-', '')}</span>
                  <span className="text-xs text-gray-500 ml-auto">{shortTime(t.timestamp)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{'\u20a9'}{fmt(Number(t.amount_krw))}</span>
                  <span className="tabular-nums">@ {'\u20a9'}{fmt(Number(t.price))}</span>
                </div>
                {t.result && (
                  <div className="text-[10px] text-gray-500 mt-1 truncate">{t.result}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
