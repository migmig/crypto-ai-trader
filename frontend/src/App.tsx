import { useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { useApi } from './hooks/useApi'
import Dashboard from './pages/Dashboard'
import HistoryPage from './pages/HistoryPage'
import LogsPage from './pages/LogsPage'
import ChartsPage from './pages/ChartsPage'
import SimulationsPage from './pages/SimulationsPage'
import PlaygroundPage from './pages/PlaygroundPage'
import ExplorerPage from './pages/ExplorerPage'
import LoginPage from './pages/LoginPage'
import TradeToaster from './components/TradeToaster'
import { timeAgo } from './utils'
import { useAuth } from './lib/auth'
import { isSupabaseEnabled } from './lib/supabase'

function UserMenu() {
  const { user, signOut } = useAuth()
  if (!isSupabaseEnabled() || !user) return null
  const email = user.email || 'user'
  return (
    <div className="flex items-center gap-2">
      <span className="hidden md:inline text-xs text-slate-400 tabular-nums">{email}</span>
      <button
        onClick={signOut}
        className="bg-slate-800 border border-slate-700 text-slate-300 px-2 sm:px-3 py-1.5 rounded-lg text-sm hover:bg-slate-700 transition cursor-pointer"
        title="로그아웃"
      >
        <span className="hidden sm:inline">Logout</span>
        <span className="sm:hidden">⎋</span>
      </button>
    </div>
  )
}

function ResetButton({ onReset }: { onReset: () => void }) {
  const [busy, setBusy] = useState(false)
  const handleClick = async () => {
    if (busy) return
    const confirm1 = window.confirm(
      '계좌 상태·거래 이력·판단 히스토리·로그를 모두 초기화합니다.\n백업은 backups/manual_YYYYMMDD_HHMMSS/ 로 자동 이동됩니다.\n\n계속하시겠습니까?',
    )
    if (!confirm1) return
    const confirm2 = window.prompt('확인을 위해 "RESET" 을 입력하세요 (대소문자 구분).')
    if (confirm2 !== 'RESET') {
      window.alert('입력이 일치하지 않아 취소되었습니다.')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/reset', { method: 'POST' })
      const data = await r.json()
      if (data.ok) {
        window.alert(
          `초기화 완료\n백업: ${data.backup}\n이동된 항목: ${data.moved.length}개\n초기 자본: ₩${data.initial_capital.toLocaleString()}`,
        )
        onReset()
      } else {
        window.alert(`초기화 실패: ${JSON.stringify(data)}`)
      }
    } catch (e) {
      window.alert(`오류: ${e}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      onClick={handleClick}
      disabled={busy}
      aria-label="Reset state"
      title="계좌 및 이력 초기화 (2단계 확인)"
      className="bg-red-900/40 border border-red-700/70 text-red-200 px-2 sm:px-3 py-1.5 rounded-lg text-sm hover:bg-red-800/60 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="hidden sm:inline">{busy ? 'Resetting…' : 'Reset'}</span>
      <span className="sm:hidden">🗑</span>
    </button>
  )
}

export default function App() {
  const auth = useAuth()
  // Supabase 연동되어 있고 로그인 안 됐으면 로그인 페이지 강제
  if (isSupabaseEnabled() && !auth.loading && !auth.session) {
    return <LoginPage />
  }
  return <AuthedApp />
}

function AuthedApp() {
  const {
    status, trades, performance, judgments, logs, loading, refresh,
    judgmentsTotal, judgmentsHasMore, loadMoreJudgments, judgmentsStats,
  } = useApi(30000)

  if (loading || !status) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center text-gray-400">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] text-gray-200">
      <TradeToaster />
      <header className="bg-gray-900 border-b border-gray-800 px-3 sm:px-6 py-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
          <h1 className="text-lg sm:text-xl font-bold shrink-0">
            <span className="text-blue-400">AI</span> Crypto Trader
          </h1>
          <nav className="flex gap-1 flex-wrap">
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
              {judgmentsTotal > 0 && (
                <span className="ml-1.5 bg-gray-700 text-gray-300 text-[10px] px-1.5 py-0.5 rounded-full">
                  {judgmentsTotal}
                </span>
              )}
            </NavLink>
            <NavLink
              to="/charts"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              Charts
            </NavLink>
            <NavLink
              to="/simulations"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              Sims
            </NavLink>
            <NavLink
              to="/playground"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              Playground
            </NavLink>
            <NavLink
              to="/explorer"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              Explorer
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
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          <span className="hidden sm:inline-block bg-emerald-900/60 text-emerald-300 px-3 py-1 rounded-full text-xs font-semibold">
            SIMULATION
          </span>
          <span className="sm:hidden bg-emerald-900/60 text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-semibold">
            SIM
          </span>
          {status.collected_at && (
            <span className="hidden md:inline text-xs text-gray-500">
              Data: {timeAgo(status.collected_at)}
            </span>
          )}
          <button
            onClick={refresh}
            aria-label="Refresh"
            className="bg-gray-800 border border-gray-700 text-gray-200 px-2 sm:px-3 py-1.5 rounded-lg text-sm hover:bg-gray-700 transition cursor-pointer"
          >
            <span className="hidden sm:inline">Refresh</span>
            <span className="sm:hidden">↻</span>
          </button>
          <ResetButton onReset={refresh} />
          <UserMenu />
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
          element={
            <HistoryPage
              judgments={judgments}
              total={judgmentsTotal}
              hasMore={judgmentsHasMore}
              onLoadMore={loadMoreJudgments}
              stats={judgmentsStats}
            />
          }
        />
        <Route
          path="/charts"
          element={
            <ChartsPage
              performance={performance}
              markets={status.markets.map((m) => m.market)}
              heldMarkets={status.holdings.map((h) => h.market)}
            />
          }
        />
        <Route
          path="/simulations"
          element={<SimulationsPage />}
        />
        <Route
          path="/playground"
          element={<PlaygroundPage />}
        />
        <Route
          path="/explorer"
          element={<ExplorerPage />}
        />
        <Route
          path="/logs"
          element={<LogsPage logs={logs} />}
        />
      </Routes>
    </div>
  )
}
