import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setInfo(''); setBusy(true)
    try {
      const err = mode === 'in'
        ? await signIn(email, password)
        : await signUp(email, password)
      if (err) setError(err)
      else if (mode === 'up') setInfo('가입 완료 — 이메일 확인 후 로그인하세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0e17] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 space-y-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-blue-400/80 font-semibold mb-2">
            Crypto AI Trader
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            {mode === 'in' ? '로그인' : '가입'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">대시보드에 접근하려면 인증이 필요합니다.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-400">이메일</span>
            <input
              type="email" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">비밀번호</span>
            <input
              type="password" required minLength={6}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </label>
          {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-700/40 rounded p-2">{error}</div>}
          {info && <div className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-700/40 rounded p-2">{info}</div>}
          <button
            type="submit" disabled={busy}
            className="w-full py-2.5 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30 text-sm font-semibold disabled:opacity-50 cursor-pointer"
          >
            {busy ? '...' : (mode === 'in' ? '로그인' : '가입')}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setInfo('') }}
          className="text-xs text-slate-400 hover:text-slate-200 w-full"
        >
          {mode === 'in' ? '계정이 없나요? 가입하기' : '이미 계정이 있나요? 로그인'}
        </button>
      </div>
    </main>
  )
}
