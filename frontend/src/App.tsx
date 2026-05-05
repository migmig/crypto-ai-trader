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
import ReversePage from './pages/ReversePage'
import LoginPage from './pages/LoginPage'
import TradeToaster from './components/TradeToaster'
import { timeAgo } from './utils'
import { useAuth } from './lib/auth'
import { isSupabaseEnabled } from './lib/supabase'

function AppleNavLink({
  to,
  end,
  children,
}: {
  to: string
  end?: boolean
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `px-2.5 py-1 text-[12px] font-normal tracking-tight transition ${
          isActive
            ? 'text-white'
            : 'text-white/60 hover:text-white'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

function UserMenu() {
  const { user, signOut } = useAuth()
  if (!isSupabaseEnabled() || !user) return null
  const email = user.email || 'user'
  return (
    <div className="flex items-center gap-2">
      <span className="hidden md:inline text-[11px] text-[color:var(--color-apple-ink-muted)] tabular-nums">{email}</span>
      <button
        onClick={signOut}
        className="bg-black/60 text-white/90 px-3 py-1.5 rounded-[8px] text-xs hover:bg-black/80 cursor-pointer"
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
      className="bg-black/60 text-red-300 hover:text-red-200 px-3 py-1.5 rounded-[8px] text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="min-h-screen bg-black flex items-center justify-center text-[color:var(--color-apple-body-dark)]">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-apple-tile-1)] text-white">
      <TradeToaster />
      <header className="bg-black px-3 sm:px-6 h-11 sm:h-11 flex flex-wrap items-center gap-3 justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
          <h1 className="text-[15px] tracking-tight font-semibold shrink-0 text-white">
            <span className="text-[color:var(--color-apple-sky)]">AI</span>&nbsp;Crypto&nbsp;Trader
          </h1>
          <nav className="flex gap-0.5 flex-wrap">
            <AppleNavLink to="/" end>Dashboard</AppleNavLink>
            <AppleNavLink to="/history">
              History
              {judgmentsTotal > 0 && (
                <span className="ml-1.5 bg-white/15 text-white/80 text-[10px] px-1.5 py-0.5 rounded-full">
                  {judgmentsTotal}
                </span>
              )}
            </AppleNavLink>
            <AppleNavLink to="/charts">Charts</AppleNavLink>
            <AppleNavLink to="/simulations">Sims</AppleNavLink>
            <AppleNavLink to="/playground">Playground</AppleNavLink>
            <AppleNavLink to="/explorer">Explorer</AppleNavLink>
            <AppleNavLink to="/reverse">Reverse</AppleNavLink>
            <AppleNavLink to="/logs">
              Logs
              {logs.some((l) => l.status === 'error') && (
                <span className="ml-1.5 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  !
                </span>
              )}
            </AppleNavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          <span className="hidden sm:inline-block text-[10px] tracking-wider text-white/70 px-2.5 py-0.5 rounded-full border border-white/15">
            SIMULATION
          </span>
          <span className="sm:hidden text-[10px] tracking-wider text-white/70 px-2 py-0.5 rounded-full border border-white/15">
            SIM
          </span>
          {status.collected_at && (
            <span className="hidden md:inline text-[11px] text-white/50">
              {timeAgo(status.collected_at)}
            </span>
          )}
          <button
            onClick={refresh}
            aria-label="Refresh"
            className="bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-[8px] text-xs cursor-pointer"
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
          path="/reverse"
          element={<ReversePage />}
        />
        <Route
          path="/logs"
          element={<LogsPage logs={logs} />}
        />
      </Routes>
    </div>
  )
}
