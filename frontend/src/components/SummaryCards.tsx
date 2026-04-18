import { fmt, fmtWon, plColor, plSign, timeAgo } from '../utils'
import type { StatusData } from '../types'

interface Props {
  data: StatusData
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-5">
      <div className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide mb-1 sm:mb-2">{label}</div>
      {children}
    </div>
  )
}

export default function SummaryCards({ data }: Props) {
  const totalBuys = Number(data.total_buy_count ?? 0)
  const totalSells = Number(data.total_sell_count ?? 0)
  const totalTrades = totalBuys + totalSells
  const totalFee = Number(data.total_fee ?? 0)
  const feePct = Number(data.fee_pct ?? 0)
  const feeSubtext =
    totalTrades > 0
      ? `${totalTrades} trades · ${feePct.toFixed(3)}%`
      : 'No trades yet'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
      <Card label="Total Value">
        <div className="text-lg sm:text-2xl font-bold text-right tabular-nums">{fmtWon(data.total)}</div>
        <div className={`text-xs sm:text-sm text-right mt-0.5 sm:mt-1 ${plColor(data.total_pl)}`}>
          {plSign(data.total_pl)}{fmt(data.total_pl)} ({plSign(data.total_pl_pct)}{data.total_pl_pct}%)
        </div>
        {data.liquidation_value !== undefined && (
          <div className="text-[10px] sm:text-xs text-right text-gray-500 mt-1 pt-1 border-t border-gray-800 tabular-nums">
            <span className="text-gray-600">청산시</span> {fmtWon(data.liquidation_value)}
            {data.liquidation_pl !== undefined && data.liquidation_pl_pct !== undefined && (
              <span className={`ml-1 ${plColor(data.liquidation_pl)}`}>
                ({plSign(data.liquidation_pl_pct)}{data.liquidation_pl_pct}%)
              </span>
            )}
          </div>
        )}
      </Card>
      <Card label="Cash">
        <div className="text-lg sm:text-2xl font-bold text-right tabular-nums">{fmtWon(data.cash)}</div>
        <div className="text-xs sm:text-sm text-right text-gray-500 mt-0.5 sm:mt-1">
          {((data.cash / data.total) * 100).toFixed(0)}% of total
        </div>
      </Card>
      <Card label="Holdings">
        <div className="text-lg sm:text-2xl font-bold text-right tabular-nums">{fmtWon(data.holdings_value)}</div>
        <div className="text-xs sm:text-sm text-right text-gray-500 mt-0.5 sm:mt-1">
          {data.holdings.length} coin{data.holdings.length !== 1 ? 's' : ''}
        </div>
      </Card>
      <Card label="Total Fees">
        <div className="text-lg sm:text-2xl font-bold text-right text-amber-400 tabular-nums">{fmtWon(totalFee)}</div>
        <div className="text-xs sm:text-sm text-right text-gray-500 mt-0.5 sm:mt-1">{feeSubtext}</div>
        {data.liquidation_fee !== undefined && (
          <div className="text-[10px] sm:text-xs text-right text-gray-500 mt-1 pt-1 border-t border-gray-800 tabular-nums">
            <span className="text-gray-600">청산시</span> <span className="text-amber-400/70">+{fmtWon(data.liquidation_fee)}</span>
            <span className="text-gray-600"> = </span><span className="text-amber-400">{fmtWon(totalFee + data.liquidation_fee)}</span>
          </div>
        )}
      </Card>
      <Card label="Today Trades">
        <div className="text-lg sm:text-2xl font-bold text-right tabular-nums">{data.total_trades_today}</div>
        <div className="text-xs sm:text-sm text-right text-gray-500 mt-0.5 sm:mt-1">
          {data.last_trade_time ? timeAgo(data.last_trade_time) : 'No trades'}
        </div>
        {totalTrades > 0 && (
          <div className="text-[10px] sm:text-xs text-right text-gray-500 mt-1 pt-1 border-t border-gray-800 tabular-nums">
            <span className="text-gray-600">누적</span>{' '}
            <span className="text-emerald-400">B {totalBuys}</span>
            <span className="text-gray-600"> / </span>
            <span className="text-red-400">S {totalSells}</span>
          </div>
        )}
      </Card>
    </div>
  )
}
