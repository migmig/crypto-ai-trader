import { fmt, plColor, plSign } from '../utils'
import type { Holding } from '../types'

interface Props {
  holdings: Holding[]
}

export default function Holdings({ holdings }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-base font-semibold mb-4">Holdings</h2>
      {holdings.length === 0 ? (
        <div className="text-gray-500 text-center py-8 text-sm">No holdings - 100% cash</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                <th className="text-left py-2.5 px-3">Coin</th>
                <th className="text-right py-2.5 px-3">Qty</th>
                <th className="text-right py-2.5 px-3">Avg Price</th>
                <th className="text-right py-2.5 px-3">Current</th>
                <th className="text-right py-2.5 px-3">Value</th>
                <th className="text-right py-2.5 px-3">P&L</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map(h => (
                <tr key={h.market} className="border-b border-gray-800/50 hover:bg-gray-800/40 transition">
                  <td className="py-2.5 px-3 font-semibold">{h.coin}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{h.qty.toFixed(6)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{'\u20a9'}{fmt(h.avg_price)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{'\u20a9'}{fmt(h.current_price)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{'\u20a9'}{fmt(h.value)}</td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${plColor(h.pl)}`}>
                    {plSign(h.pl)}{fmt(h.pl)} ({plSign(h.pl_pct)}{h.pl_pct}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
