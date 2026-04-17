import { fmt, shortTime } from '../utils'
import type { Trade } from '../types'

interface Props {
  trades: Trade[]
}

export default function RecentTrades({ trades }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-base font-semibold mb-4">Recent Trades</h2>
      {trades.length === 0 ? (
        <div className="text-gray-500 text-center py-8 text-sm">No trades yet</div>
      ) : (
        <div className="overflow-x-auto">
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
      )}
    </div>
  )
}
