import { fmt, fmtWon, plColor, plSign, timeAgo } from '../utils'
import type { StatusData } from '../types'

interface Props {
  data: StatusData
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{label}</div>
      {children}
    </div>
  )
}

export default function SummaryCards({ data }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="Total Value">
        <div className="text-2xl font-bold text-right">{fmtWon(data.total)}</div>
        <div className={`text-sm text-right mt-1 ${plColor(data.total_pl)}`}>
          {plSign(data.total_pl)}{fmt(data.total_pl)} ({plSign(data.total_pl_pct)}{data.total_pl_pct}%)
        </div>
      </Card>
      <Card label="Cash">
        <div className="text-2xl font-bold text-right">{fmtWon(data.cash)}</div>
        <div className="text-sm text-right text-gray-500 mt-1">
          {((data.cash / data.total) * 100).toFixed(0)}% of total
        </div>
      </Card>
      <Card label="Holdings">
        <div className="text-2xl font-bold text-right">{fmtWon(data.holdings_value)}</div>
        <div className="text-sm text-right text-gray-500 mt-1">
          {data.holdings.length} coin{data.holdings.length !== 1 ? 's' : ''}
        </div>
      </Card>
      <Card label="Today Trades">
        <div className="text-2xl font-bold text-right">{data.total_trades_today}</div>
        <div className="text-sm text-right text-gray-500 mt-1">
          {data.last_trade_time ? timeAgo(data.last_trade_time) : 'No trades'}
        </div>
      </Card>
    </div>
  )
}
