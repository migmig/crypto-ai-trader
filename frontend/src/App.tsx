import { Routes, Route, NavLink } from 'react-router-dom'
import { useApi } from './hooks/useApi'
import Dashboard from './pages/Dashboard'
import HistoryPage from './pages/HistoryPage'
import LogsPage from './pages/LogsPage'
import { timeAgo } from './utils'

export default function App() {
  const { status, trades, performance, judgments, logs, loading, refresh } = useApi(30000)

  if (loading || !status) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center text-gray-400">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] text-gray-200">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold">
            <span className="text-blue-400">AI</span> Crypto Trader
          </h1>
          <nav className="flex gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              History
              {judgments.length > 0 && (
                <span className="ml-1.5 bg-gray-700 text-gray-300 text-[10px] px-1.5 py-0.5 rounded-full">
                  {judgments.length}
                </span>
              )}
            </NavLink>
            <NavLink
              to="/logs"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              Logs
              {logs.some((l) => l.status === 'error') && (
                <span className="ml-1.5 bg-red-700 text-red-200 text-[10px] px-1.5 py-0.5 rounded-full">
                  !
                </span>
              )}
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-emerald-900/60 text-emerald-300 px-3 py-1 rounded-full text-xs font-semibold">
            SIMULATION
          </span>
          {status.collected_at && (
            <span className="text-xs text-gray-500">Data: {timeAgo(status.collected_at)}</span>
          )}
          <button
            onClick={refresh}
            className="bg-gray-800 border border-gray-700 text-gray-200 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-700 transition cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <Dashboard
              status={status}
              trades={trades}
              performance={performance}
              judgments={judgments}
            />
          }
        />
        <Route
          path="/history"
          element={<HistoryPage judgments={judgments} />}
        />
        <Route
          path="/logs"
          element={<LogsPage logs={logs} />}
        />
      </Routes>
    </div>
  )
}
