import { useApi } from './hooks/useApi'
import Header from './components/Header'
import SummaryCards from './components/SummaryCards'
import MarketTable from './components/MarketTable'
import AIJudgment from './components/AIJudgment'
import Holdings from './components/Holdings'
import PerformanceChart from './components/PerformanceChart'
import JudgmentHistory from './components/JudgmentHistory'
import RecentTrades from './components/RecentTrades'

export default function App() {
  const { status, trades, performance, judgments, loading, refresh } = useApi(30000)

  if (loading || !status) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center text-gray-400">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] text-gray-200">
      <Header collectedAt={status.collected_at} onRefresh={refresh} />
      <main className="max-w-7xl mx-auto p-5 space-y-5">
        <SummaryCards data={status} />

        <MarketTable markets={status.markets} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <AIJudgment action={status.last_action} />
          <Holdings holdings={status.holdings} />
        </div>

        <PerformanceChart data={performance} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <JudgmentHistory judgments={judgments} />
          <RecentTrades trades={trades} />
        </div>
      </main>
    </div>
  )
}
