import SummaryCards from '../components/SummaryCards'
import MarketTable from '../components/MarketTable'
import AIJudgment from '../components/AIJudgment'
import Holdings from '../components/Holdings'
import PerformanceChart from '../components/PerformanceChart'
import RecentTrades from '../components/RecentTrades'
import type { StatusData, Trade, PerfRecord, Judgment } from '../types'
import { Link } from 'react-router-dom'

interface Props {
  status: StatusData
  trades: Trade[]
  performance: PerfRecord[]
  judgments: Judgment[]
}

export default function Dashboard({ status, trades, performance, judgments }: Props) {
  return (
    <main className="max-w-7xl mx-auto p-3 sm:p-5 space-y-3 sm:space-y-5">
      <SummaryCards data={status} />
      <MarketTable markets={status.markets} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
        <AIJudgment action={status.last_action} />
        <Holdings holdings={status.holdings} />
      </div>

      <PerformanceChart data={performance} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Recent Judgments</h2>
            <Link
              to="/history"
              className="text-xs text-blue-400 hover:text-blue-300 transition"
            >
              View all &rarr;
            </Link>
          </div>
          {judgments.length === 0 ? (
            <div className="text-gray-500 text-center py-8 text-sm">No judgments yet</div>
          ) : (
            <div className="space-y-2 text-sm">
              {judgments.slice(0, 5).map((j, i) => {
                const perCoin = j.per_coin || {}
                const coins = Object.values(perCoin)
                const hasActions = j.actions && j.actions.length > 0
                return (
                  <Link
                    key={i}
                    to={`/history?ts=${encodeURIComponent(j.timestamp)}`}
                    className="block bg-slate-800 border border-slate-700 rounded-lg p-3 hover:border-blue-500/40 transition"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-blue-400 font-semibold">
                        {new Date(j.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        j.source === 'ai'
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-800'
                          : 'bg-slate-700 text-gray-300 border border-slate-600'
                      }`}>
                        {j.source === 'ai' ? 'AI' : 'ALGO'}
                      </span>
                      {hasActions ? (
                        <span className="text-emerald-400 font-semibold">
                          {j.actions.length} action{j.actions.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-gray-500">HOLD</span>
                      )}
                      {coins.length > 0 && (
                        <span className="text-gray-500 truncate">
                          {coins.filter(c => c.signal !== 'hold').map(c => `${c.coin}:${c.signal}`).join(' ') || 'all hold'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 truncate">
                      {j.market_summary || '-'}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
        <RecentTrades trades={trades} />
      </div>
    </main>
  )
}
