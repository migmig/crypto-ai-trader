import { fmt, plColor, plSign, rsiColor, rsiBg, trendColor } from '../utils'
import type { MarketItem } from '../types'

interface Props {
  markets: MarketItem[]
}

export default function MarketTable({ markets }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-base font-semibold mb-4">Market Overview</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
              <th className="text-left py-2.5 px-3">Coin</th>
              <th className="text-right py-2.5 px-3">Price</th>
              <th className="text-right py-2.5 px-3">Change</th>
              <th className="text-right py-2.5 px-3">RSI 15m</th>
              <th className="text-right py-2.5 px-3">RSI 1h</th>
              <th className="text-right py-2.5 px-3">MACD</th>
              <th className="text-right py-2.5 px-3">Vol Ratio</th>
              <th className="text-center py-2.5 px-3">Trend</th>
            </tr>
          </thead>
          <tbody>
            {markets.map(m => {
              const chg = (m.change_rate * 100).toFixed(2)
              const macdH = m.macd_hist != null ? (m.macd_hist >= 0 ? '+' : '') + fmt(m.macd_hist) : '-'
              return (
                <tr key={m.market} className="border-b border-gray-800/50 hover:bg-gray-800/40 transition">
                  <td className="py-2.5 px-3 font-semibold">{m.coin}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{'\u20a9'}{fmt(m.price)}</td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${plColor(m.change_rate)}`}>
                    {plSign(m.change_rate)}{chg}%
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {m.rsi_15m != null ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className={rsiColor(m.rsi_15m)}>{m.rsi_15m}</span>
                        <div className="w-10 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${rsiBg(m.rsi_15m)}`} style={{ width: `${m.rsi_15m}%` }} />
                        </div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {m.rsi_1h != null ? (
                      <span className={rsiColor(m.rsi_1h)}>{m.rsi_1h}</span>
                    ) : '-'}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${plColor(m.macd_hist ?? 0)}`}>
                    {macdH}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-400">
                    {m.volume_ratio != null ? `${m.volume_ratio}x` : '-'}
                  </td>
                  <td className={`py-2.5 px-3 text-center ${trendColor(m.trend)}`}>
                    {m.trend || '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
