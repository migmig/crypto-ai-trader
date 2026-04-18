import { useNavigate } from 'react-router-dom'
import { fmt, plColor, plSign, rsiColor, rsiBg, trendColor } from '../utils'
import type { MarketItem } from '../types'

interface Props {
  markets: MarketItem[]
}

export default function MarketTable({ markets }: Props) {
  const navigate = useNavigate()
  const goChart = (market: string) => navigate(`/charts?coin=${encodeURIComponent(market)}`)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-5">
      <h2 className="text-base font-semibold mb-4">Market Overview</h2>

      {/* Desktop: 테이블 */}
      <div className="hidden md:block overflow-x-auto">
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
            {markets.map((m) => {
              const chg = (m.change_rate * 100).toFixed(2)
              const macdH = m.macd_hist != null ? (m.macd_hist >= 0 ? '+' : '') + fmt(m.macd_hist) : '-'
              return (
                <tr
                  key={m.market}
                  onClick={() => goChart(m.market)}
                  className="border-b border-gray-800/50 hover:bg-gray-800/40 transition cursor-pointer"
                >
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
                    {m.rsi_1h != null ? <span className={rsiColor(m.rsi_1h)}>{m.rsi_1h}</span> : '-'}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${plColor(m.macd_hist ?? 0)}`}>
                    {macdH}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-400">
                    {m.volume_ratio != null ? `${m.volume_ratio}x` : '-'}
                  </td>
                  <td className={`py-2.5 px-3 text-center ${trendColor(m.trend)}`}>{m.trend || '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: 카드 그리드 */}
      <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-2">
        {markets.map((m) => {
          const chg = (m.change_rate * 100).toFixed(2)
          const macdH = m.macd_hist != null ? (m.macd_hist >= 0 ? '+' : '') + fmt(m.macd_hist) : '-'
          return (
            <div
              key={m.market}
              onClick={() => goChart(m.market)}
              className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm cursor-pointer hover:bg-slate-700/60 transition"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-base">{m.coin}</span>
                <span className={`text-xs ${trendColor(m.trend)}`}>{m.trend || '-'}</span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-gray-200 tabular-nums">{'\u20a9'}{fmt(m.price)}</span>
                <span className={`text-xs tabular-nums ${plColor(m.change_rate)}`}>
                  {plSign(m.change_rate)}{chg}%
                </span>
              </div>
              <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[11px] text-gray-400">
                <div>
                  <div className="text-gray-500">RSI15m</div>
                  <div className={m.rsi_15m != null ? rsiColor(m.rsi_15m) : ''}>
                    {m.rsi_15m ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">RSI1h</div>
                  <div className={m.rsi_1h != null ? rsiColor(m.rsi_1h) : ''}>
                    {m.rsi_1h ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">MACD</div>
                  <div className={plColor(m.macd_hist ?? 0)}>{macdH}</div>
                </div>
                <div>
                  <div className="text-gray-500">Vol×</div>
                  <div>{m.volume_ratio != null ? `${m.volume_ratio}x` : '-'}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
