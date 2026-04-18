import { useState, useEffect } from 'react'

interface SimResult {
  id: string
  title: string
  subtitle: string
  description: string
  chart: string | null
  note: string
  rows: Record<string, string | number>[]
}

export default function SimulationsPage() {
  const [sims, setSims] = useState<SimResult[]>([])
  const [active, setActive] = useState<string>('')
  const [readme, setReadme] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/simulations')
      .then((r) => r.json())
      .then((d: SimResult[]) => {
        setSims(d)
        if (d.length && !active) setActive(d[0].id)
      })
      .finally(() => setLoading(false))
    fetch('/api/simulations/readme')
      .then((r) => r.text())
      .then(setReadme)
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto p-5 text-gray-400">Loading simulations...</main>
    )
  }

  if (sims.length === 0) {
    return (
      <main className="max-w-7xl mx-auto p-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500">
          시뮬레이션 결과가 없습니다. <code className="text-gray-300">simulations/scripts/</code>에서 먼저 실행하세요.
        </div>
      </main>
    )
  }

  const current = sims.find((s) => s.id === active) || sims[0]

  return (
    <main className="max-w-7xl mx-auto p-3 sm:p-5 space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
        <h1 className="text-lg sm:text-xl font-bold mb-2">매매 룰 검증 시뮬레이션</h1>
        <p className="text-xs sm:text-sm text-gray-400">
          CLAUDE.md의 룰이 실제 시장 데이터(BTC 15분봉)에서 어떻게 작동하는지 검증한 결과. 과최적화 함정과 그 극복 과정 기록.
        </p>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 overflow-x-auto">
        {sims.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition cursor-pointer ${
              active === s.id
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <span className="text-gray-500 mr-1.5">0{i + 1}.</span>{s.title}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base sm:text-lg font-semibold">{current.title}</h2>
          <div className="text-xs sm:text-sm text-blue-400/80 mt-0.5">{current.subtitle}</div>
        </div>
        <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">{current.description}</p>

        {current.chart && (
          <div className="bg-black/40 border border-gray-800 rounded-lg p-2 overflow-auto">
            <img
              src={`/simulations/charts/${current.chart}`}
              alt={current.title}
              className="mx-auto max-w-full"
              loading="lazy"
            />
          </div>
        )}

        <ResultTable rows={current.rows} />

        <div className="border-t border-gray-800 pt-3 text-xs sm:text-sm text-amber-300/90">
          <span className="text-gray-500 mr-1">💡</span>{current.note}
        </div>
      </div>

      {readme && (
        <details className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold hover:bg-gray-800/50 transition">
            전체 README 보기
          </summary>
          <pre className="text-[11px] sm:text-xs text-gray-300 p-4 overflow-auto max-h-[70vh] whitespace-pre-wrap leading-relaxed">
            {readme}
          </pre>
        </details>
      )}
    </main>
  )
}

function ResultTable({ rows }: { rows: Record<string, string | number>[] }) {
  if (!rows || rows.length === 0) return null
  const cols = Object.keys(rows[0])

  const isNumeric = (v: unknown): v is number =>
    typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)))

  const fmtValue = (col: string, v: unknown) => {
    if (v === null || v === undefined || v === '') return '-'
    if (isNumeric(v)) {
      const n = typeof v === 'number' ? v : Number(v)
      // 수익률처럼 보이는 컬럼엔 % 붙이기
      if (/pnl|avg|d\d+/i.test(col)) {
        const sign = n > 0 ? '+' : ''
        return `${sign}${n.toFixed(2)}%`
      }
      return Number.isInteger(n) ? n.toString() : n.toFixed(2)
    }
    return String(v)
  }

  const colorFor = (col: string, v: unknown) => {
    if (!/pnl|avg|d\d+/i.test(col)) return 'text-gray-200'
    if (!isNumeric(v)) return 'text-gray-200'
    const n = typeof v === 'number' ? v : Number(v)
    if (n > 0) return 'text-emerald-400'
    if (n < 0) return 'text-red-400'
    return 'text-gray-200'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 uppercase text-[10px] sm:text-xs">
            {cols.map((c) => (
              <th key={c} className={`py-2 px-2 ${c === cols[0] ? 'text-left' : 'text-right'}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/40 transition">
              {cols.map((c, j) => (
                <td
                  key={c}
                  className={`py-2 px-2 tabular-nums ${j === 0 ? 'text-left font-medium text-gray-100' : `text-right ${colorFor(c, r[c])}`}`}
                >
                  {fmtValue(c, r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
