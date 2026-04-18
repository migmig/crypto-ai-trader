import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface ExtraTable {
  title: string
  rows: Record<string, string | number>[]
}

interface SimResult {
  id: string
  title: string
  subtitle: string
  description: string
  chart: string | null
  extra_charts?: string[]
  extra_tables?: ExtraTable[]
  note: string
  rows: Record<string, string | number>[]
}

interface SummaryItem {
  label: string
  value: string
  tone?: 'neutral' | 'positive' | 'negative'
  hint?: string
}

const POSITIVE = '#34d399'
const NEGATIVE = '#f87171'
const PRIMARY = '#60a5fa'
const SECONDARY = '#f59e0b'
const MUTED = '#94a3b8'
const COMPARE_COLORS = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#f97316', '#22c55e']

const STORY_ORDER = [
  '01_feb5_position',
  '02_mitigation_variants',
  '03_multi_horizon',
  '04_adaptive_sizing',
  '05_grid_search',
  '06_interval_compare',
  '07_daily_horizons',
  '08_cycle_freq',
  '09_cycle4h',
  '10_longshort',
  '11_longshort_horizons',
]

const HEADLINES: { id: string; headline: string; tone: 'pos' | 'neg' | 'neutral' }[] = [
  { id: '01_feb5_position', headline: '2/5 급락 당일 현재 룰이 바닥에서 손절됨', tone: 'neg' },
  { id: '02_mitigation_variants', headline: 'F2 완화안이 단일 케이스에서 압승 — 함정 암시', tone: 'pos' },
  { id: '03_multi_horizon', headline: '다중 기간에서 F2 붕괴, 현재 룰이 오히려 견고', tone: 'neutral' },
  { id: '04_adaptive_sizing', headline: '사이즈 튜닝은 거의 차이 없음 (+0.21%p)', tone: 'neutral' },
  { id: '05_grid_search', headline: '1년치 100룰 그리드 — 현재 룰 84위, 알트 전반 약세', tone: 'neg' },
  { id: '06_interval_compare', headline: '15분 → 1일로 바꾸는 것만으로 +45%p 개선', tone: 'pos' },
  { id: '07_daily_horizons', headline: '일봉 + 1080일 지평에서 현재 룰 +25.58%', tone: 'pos' },
  { id: '08_cycle_freq', headline: '8시간 체크 주기가 최적 (+21%), 현재 1시간 대비 +5%p', tone: 'pos' },
  { id: '09_cycle4h', headline: '4시간봉 + 48h 주기가 +113% — 단 낙폭 감수 필요', tone: 'pos' },
  { id: '10_longshort', headline: '공매도 추가는 평균 -7%p 악화, 낙폭 -38%로 확대', tone: 'neg' },
  { id: '11_longshort_horizons', headline: '단기(30~90일) 무효, 1년 short 유일 양수, 2년은 접전', tone: 'neutral' },
]

export default function SimulationsPage() {
  const [sims, setSims] = useState<SimResult[]>([])
  const [readme, setReadme] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/simulations')
      .then((r) => r.json())
      .then(setSims)
      .finally(() => setLoading(false))
    fetch('/api/simulations/readme')
      .then((r) => r.text())
      .then(setReadme)
      .catch(() => {})
  }, [])

  const orderedSims = useMemo(() => {
    const byId = new Map(sims.map((s) => [s.id, s]))
    const ordered: SimResult[] = []
    for (const id of STORY_ORDER) {
      const s = byId.get(id)
      if (s) ordered.push(s)
    }
    // 순서에 없는 것도 뒤에 붙임 (안전망)
    for (const s of sims) if (!STORY_ORDER.includes(s.id)) ordered.push(s)
    return ordered
  }, [sims])

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto p-5 text-gray-400">Loading simulations...</main>
    )
  }

  if (orderedSims.length === 0) {
    return (
      <main className="max-w-7xl mx-auto p-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500">
          시뮬레이션 결과가 없습니다. <code className="text-gray-300">simulations/scripts/</code>에서 먼저 실행하세요.
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-7xl mx-auto p-3 sm:p-6 space-y-10 pb-24">
      <HeroIntro />

      <JourneyBanner sims={orderedSims} />

      <FinalConclusionCard />

      <div className="flex items-center gap-3 pt-4">
        <div className="h-px bg-slate-800 flex-1" />
        <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Detailed Findings</div>
        <div className="h-px bg-slate-800 flex-1" />
      </div>

      {orderedSims.map((sim, idx) => (
        <SimSection key={sim.id} sim={sim} number={idx + 1} />
      ))}

      {readme && (
        <details className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold hover:bg-gray-800/50 transition">
            전체 README 원문 (markdown)
          </summary>
          <pre className="text-[11px] sm:text-xs text-gray-300 p-4 overflow-auto max-h-[70vh] whitespace-pre-wrap leading-relaxed">
            {readme}
          </pre>
        </details>
      )}
    </main>
  )
}

function HeroIntro() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 sm:p-10">
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute -bottom-16 -left-12 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="relative space-y-4">
        <div className="text-[11px] uppercase tracking-[0.28em] text-blue-400/80 font-semibold">
          매매 룰 검증 시뮬레이션 · 종합 리포트
        </div>
        <h1 className="text-2xl sm:text-4xl font-bold text-white leading-tight">
          "우리 알고리즘이 진짜 돈을 벌 수 있는가?"
        </h1>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-3xl">
          2/5 BTC 바닥 손절 사건에서 시작해 8번의 시뮬레이션을 거친 결과. 룰을 튜닝하며 돌아다니다가
          결국 <strong className="text-white">가장 중요한 결정은 캔들 인터벌 선택이었다</strong>는 답에 도달했습니다.
          모든 코드·CSV·차트는 재현 가능하며, 아래는 그 여정 전체의 요약본입니다.
        </p>
      </div>
    </section>
  )
}

function JourneyBanner({ sims }: { sims: SimResult[] }) {
  return (
    <section className="space-y-3">
      <SectionTitle title="한눈에 보는 진행 흐름" subtitle="각 단계가 어떤 결론을 남겼는지 요약" />
      <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {HEADLINES.map(({ id, headline, tone }, i) => {
          const sim = sims.find((s) => s.id === id)
          const toneColor =
            tone === 'pos'
              ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300'
              : tone === 'neg'
                ? 'border-red-500/40 bg-red-500/5 text-red-300'
                : 'border-slate-700 bg-slate-950/60 text-slate-200'
          return (
            <li key={id} className={`rounded-xl border p-4 ${toneColor}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-mono tabular-nums text-slate-500">0{i + 1}</span>
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400 truncate">
                  {sim?.title ?? id}
                </span>
              </div>
              <div className="text-sm font-medium leading-snug">{headline}</div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function FinalConclusionCard() {
  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-slate-950 to-blue-500/5 p-6 sm:p-8 space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-[0.24em] font-semibold text-emerald-300">
          최종 권고
        </span>
        <span className="h-px flex-1 bg-emerald-500/30" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl sm:text-2xl font-bold text-white">
          일봉 지표 + 8시간 체크 주기 (v5 구성)
        </h2>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-3xl">
          시뮬 06·07·08의 결론으로 실제 알고리즘을 전환 완료. 룰 파라미터는 그리드 서치 기반으로 살짝 완화했습니다.
          데이터 수집은 대시보드 최신성을 위해 별도로 2분 주기 유지.
        </p>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FinalStat label="판단 기준" value="일봉 지표" hint="15m → 1d (+45%p)" />
        <FinalStat label="매매 사이클" value="8시간" hint="1h → 8h (+5%p)" />
        <FinalStat label="백스톱" value="-25%" hint="-15% → -25%" />
        <FinalStat label="트레일링" value="-10%" hint="-7% → -10%" />
        <FinalStat label="최소 홀딩" value="24시간" hint="30분 → 1440분" />
        <FinalStat label="Sell Strong" value="+3% 이상 익절" hint="손실 구간 매도 차단" />
        <FinalStat label="일일 최대거래" value="5회" hint="20회 → 5회" />
        <FinalStat label="데이터 수집" value="2분" hint="대시보드 전용, 매매와 분리" />
      </dl>
    </section>
  )
}

function FinalStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1.5">{label}</div>
      <div className="text-base sm:text-lg font-semibold text-white">{value}</div>
      {hint ? <div className="text-[11px] text-slate-500 mt-1">{hint}</div> : null}
    </div>
  )
}

function SimSection({ sim, number }: { sim: SimResult; number: number }) {
  const summaryItems = buildSummary(sim)
  const headline = HEADLINES.find((h) => h.id === sim.id)
  const toneAccent =
    headline?.tone === 'pos'
      ? 'border-emerald-500/30'
      : headline?.tone === 'neg'
        ? 'border-red-500/30'
        : 'border-slate-800'

  return (
    <section id={sim.id} className={`rounded-2xl border ${toneAccent} bg-slate-900/40 p-5 sm:p-7 space-y-6 scroll-mt-20`}>
      <header className="flex items-start gap-4 flex-wrap">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 text-blue-300 font-mono font-semibold shrink-0">
          {String(number).padStart(2, '0')}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
            {headline?.headline ?? '시뮬레이션'}
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white">{sim.title}</h2>
          <div className="text-xs sm:text-sm text-blue-300/80">{sim.subtitle}</div>
        </div>
      </header>

      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">{sim.description}</p>

      {summaryItems.length > 0 && <SummaryGrid items={summaryItems} />}

      <SimulationChart sim={sim} />

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300 mb-2 font-semibold">Key Insight</div>
        <p className="text-sm text-slate-100 leading-relaxed">{sim.note}</p>
      </div>

      <details className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden group">
        <summary className="px-4 py-3 cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 hover:text-slate-200 transition select-none">
          상세 데이터 + 보조 자료 ▾
        </summary>
        <div className="p-4 border-t border-slate-800 space-y-5">
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-[0.18em] text-slate-500">원본 CSV</h4>
            <ResultTable rows={sim.rows} />
          </div>

          {sim.extra_tables?.map((t, i) => (
            <div key={i} className="space-y-2">
              <h4 className="text-xs uppercase tracking-[0.18em] text-slate-500">{t.title}</h4>
              <ResultTable rows={t.rows} />
            </div>
          ))}

          {sim.chart || sim.extra_charts?.length ? (
            <div className="space-y-2">
              <h4 className="text-xs uppercase tracking-[0.18em] text-slate-500">정적 차트 원본</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[sim.chart, ...(sim.extra_charts ?? [])]
                  .filter((c): c is string => !!c)
                  .map((c) => (
                    <div key={c} className="bg-black/30 border border-slate-800 rounded-lg p-2">
                      <img src={`/simulations/charts/${c}`} alt={c} className="mx-auto max-w-full rounded" loading="lazy" />
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  )
}

function SimulationChart({ sim }: { sim: SimResult }) {
  if (!sim.rows?.length) return null

  if (sim.id === '01_feb5_position' || sim.id === '02_mitigation_variants') {
    return (
      <ChartCard
        title="변형안 손익 비교"
        subtitle="막대는 수익률, 선은 이벤트 수입니다."
      >
        <VariantComparisonChart rows={sim.rows} />
      </ChartCard>
    )
  }

  if (sim.id === '03_multi_horizon' || sim.id === '04_adaptive_sizing') {
    const labelKey = sim.id === '03_multi_horizon' ? 'variant' : 'strategy'
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          title="기간별 성과 궤적"
          subtitle="30/60/90/120/150일 기준 변화폭을 한 눈에 비교합니다."
        >
          <HorizonLineChart rows={sim.rows} labelKey={labelKey} />
        </ChartCard>
        <ChartCard
          title="평균 성과 랭킹"
          subtitle="같은 기간 묶음에서 평균 기준으로 정렬했습니다."
        >
          <AverageRankingChart rows={sim.rows} labelKey={labelKey} avgKey="avg" />
        </ChartCard>
      </div>
    )
  }

  if (sim.id === '05_grid_search') {
    return (
      <ChartCard
        title="상위 룰 리더보드"
        subtitle="평균 수익률과 최악 구간 방어력을 함께 봅니다."
      >
        <GridTopChart rows={sim.rows} />
      </ChartCard>
    )
  }

  if (sim.id === '06_interval_compare') {
    return (
      <ChartCard
        title="인터벌별 성과 비교"
        subtitle="최적 룰과 현재 룰의 평균 수익률을 같은 축에서 비교합니다."
      >
        <IntervalCompareChart rows={sim.rows} />
      </ChartCard>
    )
  }

  if (sim.id === '07_daily_horizons') {
    return (
      <ChartCard
        title="일봉 지평별 성능"
        subtitle="지평이 길어질수록 현재 룰과 최적 룰이 어떻게 달라지는지 보여줍니다."
      >
        <DailyHorizonsChart rows={sim.rows} />
      </ChartCard>
    )
  }

  if (sim.id === '08_cycle_freq') {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="주기별 평균 수익률" subtitle="체크 주기가 P&L에 미치는 영향 (2년치 10코인)">
          <CycleFreqPnlChart rows={sim.rows} />
        </ChartCard>
        <ChartCard title="주기별 평균 최대 낙폭" subtitle="값이 작을수록 방어력 ↑ (음수)">
          <CycleFreqDDChart rows={sim.rows} />
        </ChartCard>
      </div>
    )
  }

  if (sim.id === '09_cycle4h') {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="주기별 평균 수익률" subtitle="4시간봉 신호 기준, 최대 8년치 데이터">
          <Cycle4hPnlChart rows={sim.rows} />
        </ChartCard>
        <ChartCard title="주기별 낙폭·매매 횟수" subtitle="주기가 길수록 노이즈 걸러짐 → 매매 급감">
          <Cycle4hTradesChart rows={sim.rows} />
        </ChartCard>
      </div>
    )
  }

  if (sim.id === '10_longshort') {
    return (
      <ChartCard title="모드별 평균 수익률" subtitle="long / short / long+short 각각의 평균 성과">
        <LongShortSummaryChart rows={sim.rows} />
      </ChartCard>
    )
  }

  if (sim.id === '11_longshort_horizons') {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="지평별 수익률 (3 모드)" subtitle="막대 = long / short / long+short">
          <LongShortHorizonsChart rows={sim.rows} metric="avg_pnl_pct" />
        </ChartCard>
        <ChartCard title="지평별 최대 낙폭 (3 모드)" subtitle="L+S 는 대부분 낙폭 확대">
          <LongShortHorizonsChart rows={sim.rows} metric="avg_max_dd_pct" />
        </ChartCard>
      </div>
    )
  }

  return null
}

function LongShortHorizonsChart({ rows, metric }: { rows: Record<string, string | number>[]; metric: string }) {
  // 지평별로 묶어 각 모드를 병렬 막대로
  const horizons = Array.from(new Set(rows.map((r) => toNumber(r.horizon_days)))).sort((a, b) => a - b)
  const data = horizons.map((h) => {
    const byMode: Record<string, number> = {}
    for (const row of rows) {
      if (toNumber(row.horizon_days) === h) {
        byMode[String(row.mode)] = toNumber(row[metric])
      }
    }
    return { name: `${h}일`, long: byMode.long ?? 0, short: byMode.short ?? 0, long_short: byMode.long_short ?? 0 }
  })
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="long" name="Long" fill="#10b981" radius={[6, 6, 0, 0]} />
        <Bar dataKey="short" name="Short" fill="#f87171" radius={[6, 6, 0, 0]} />
        <Bar dataKey="long_short" name="L+S" fill="#a78bfa" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function LongShortSummaryChart({ rows }: { rows: Record<string, string | number>[] }) {
  const data = rows.map((r) => ({
    mode: String(r.mode ?? '-'),
    pnl: toNumber(r.avg_pnl_pct),
    dd: toNumber(r.avg_max_dd_pct),
  }))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="mode" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="pnl" name="Avg P&L %" radius={[8, 8, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.mode} fill={d.pnl >= 0 ? POSITIVE : NEGATIVE} />
          ))}
        </Bar>
        <Bar dataKey="dd" name="Avg Max DD %" fill="#f59e0b" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function Cycle4hPnlChart({ rows }: { rows: Record<string, string | number>[] }) {
  const data = rows.map((r) => ({
    name: formatHoursLabel(toNumber(r.cycle_hours)),
    avg_pnl_pct: toNumber(r.avg_pnl_pct),
    avg_max_dd_pct: toNumber(r.avg_max_dd_pct),
  }))
  const maxVal = Math.max(...data.map((d) => d.avg_pnl_pct))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="avg_pnl_pct" name="Avg P&L %" radius={[8, 8, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.avg_pnl_pct === maxVal ? POSITIVE : d.avg_pnl_pct >= 0 ? PRIMARY : NEGATIVE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function Cycle4hTradesChart({ rows }: { rows: Record<string, string | number>[] }) {
  const data = rows.map((r) => ({
    name: formatHoursLabel(toNumber(r.cycle_hours)),
    avg_max_dd_pct: toNumber(r.avg_max_dd_pct),
    total_buys: toNumber(r.total_buys),
  }))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar yAxisId="left" dataKey="avg_max_dd_pct" name="Avg DD %" fill={NEGATIVE} radius={[8, 8, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="total_buys" name="Total Buys" stroke={SECONDARY} strokeWidth={2} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function formatHoursLabel(h: number) {
  if (h < 24) return `${h}시간`
  return `${h / 24}일`
}

function CycleFreqPnlChart({ rows }: { rows: Record<string, string | number>[] }) {
  const data = rows.map((r) => ({
    name: formatFreqLabel(toNumber(r.freq_minutes)),
    avg_pnl_pct: toNumber(r.avg_pnl_pct),
  }))
  const maxVal = Math.max(...data.map((d) => d.avg_pnl_pct))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="avg_pnl_pct" name="Avg P&L %" radius={[8, 8, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.avg_pnl_pct === maxVal ? POSITIVE : d.avg_pnl_pct >= 0 ? PRIMARY : NEGATIVE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function CycleFreqDDChart({ rows }: { rows: Record<string, string | number>[] }) {
  const data = rows.map((r) => ({
    name: formatFreqLabel(toNumber(r.freq_minutes)),
    avg_max_dd_pct: toNumber(r.avg_max_dd_pct),
  }))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="avg_max_dd_pct" name="Avg Max Drawdown %" fill={NEGATIVE} radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function formatFreqLabel(minutes: number) {
  if (minutes < 60) return `${minutes}분`
  if (minutes < 1440) return `${Math.round(minutes / 60)}시간`
  return `${Math.round(minutes / 1440)}일`
}

function SummaryGrid({ items }: { items: SummaryItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {items.map((item) => {
        const toneClass =
          item.tone === 'positive'
            ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
            : item.tone === 'negative'
              ? 'text-red-300 border-red-500/30 bg-red-500/10'
              : 'text-slate-200 border-slate-700 bg-slate-950/60'
        return (
          <div key={item.label} className={`rounded-xl border p-4 ${toneClass}`}>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2">{item.label}</div>
            <div className="text-xl font-semibold text-white">{item.value}</div>
            {item.hint ? <div className="text-xs text-slate-400 mt-2">{item.hint}</div> : null}
          </div>
        )
      })}
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
      <SectionTitle title={title} subtitle={subtitle} />
      {children}
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm sm:text-base font-semibold text-slate-100">{title}</h3>
      <p className="text-xs sm:text-sm text-slate-400 mt-1">{subtitle}</p>
    </div>
  )
}

function VariantComparisonChart({ rows }: { rows: Record<string, string | number>[] }) {
  const data = rows.map((row) => ({
    name: String(row.variant ?? row.strategy ?? '-'),
    pnl_pct: toNumber(row.pnl_pct),
    events: toNumber(row.events),
  }))

  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-12} height={64} textAnchor="end" />
        <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar yAxisId="left" dataKey="pnl_pct" name="PnL %" radius={[8, 8, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.pnl_pct >= 0 ? POSITIVE : NEGATIVE} />
          ))}
        </Bar>
        <Line yAxisId="right" type="monotone" dataKey="events" name="Events" stroke={SECONDARY} strokeWidth={2} dot={{ r: 3 }} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function HorizonLineChart({
  rows,
  labelKey,
}: {
  rows: Record<string, string | number>[]
  labelKey: string
}) {
  const horizonKeys = Object.keys(rows[0]).filter((k) => /^d\d+$/i.test(k))
  const data = horizonKeys.map((h) => {
    const point: Record<string, string | number> = { horizon: h.replace(/^d/i, '') + '일' }
    for (const row of rows) {
      point[String(row[labelKey])] = toNumber(row[h])
    }
    return point
  })

  const labels = rows.map((row) => String(row[labelKey]))

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="horizon" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        {labels.map((label, idx) => (
          <Line
            key={label}
            type="monotone"
            dataKey={label}
            stroke={COMPARE_COLORS[idx % COMPARE_COLORS.length]}
            strokeWidth={label.includes('현재') ? 3 : 2}
            dot={{ r: 2 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function AverageRankingChart({
  rows,
  labelKey,
  avgKey,
}: {
  rows: Record<string, string | number>[]
  labelKey: string
  avgKey: string
}) {
  const data = [...rows]
    .map((row) => ({
      name: String(row[labelKey]),
      avg: toNumber(row[avgKey]),
    }))
    .sort((a, b) => b.avg - a.avg)

  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 20, left: 16, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" horizontal={false} />
        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fill: '#cbd5e1', fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="avg" name="Average %" radius={[0, 8, 8, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.avg >= 0 ? POSITIVE : NEGATIVE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function GridTopChart({ rows }: { rows: Record<string, string | number>[] }) {
  const data = rows
    .slice(0, 12)
    .map((row) => ({
      name: `#${String(row.rank)}`,
      avg_pnl_pct: toNumber(row.avg_pnl_pct),
      worst_pnl_pct: toNumber(row.worst_pnl_pct),
      best_pnl_pct: toNumber(row.best_pnl_pct),
    }))

  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Line type="monotone" dataKey="avg_pnl_pct" name="Avg %" stroke={PRIMARY} strokeWidth={3} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="worst_pnl_pct" name="Worst %" stroke={NEGATIVE} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="best_pnl_pct" name="Best %" stroke={POSITIVE} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function IntervalCompareChart({ rows }: { rows: Record<string, string | number>[] }) {
  const data = rows.map((row) => ({
    name: String(row.label),
    best: toNumber(row.best_avg_pnl),
    current: toNumber(row.current_rule_avg_pnl),
    gap: toNumber(row.best_avg_pnl) - toNumber(row.current_rule_avg_pnl),
  }))

  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="best" name="Best Rule Avg %" fill={PRIMARY} radius={[8, 8, 0, 0]} />
        <Bar dataKey="current" name="Current Rule Avg %" fill={SECONDARY} radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function DailyHorizonsChart({ rows }: { rows: Record<string, string | number>[] }) {
  const data = rows.map((row) => ({
    horizon: `${String(row.horizon_days)}일`,
    best_avg_pnl: toNumber(row.best_avg_pnl),
    current_rule_avg_pnl: toNumber(row.current_rule_avg_pnl),
    current_rule_rank: toNumber(row.current_rule_rank),
  }))

  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="horizon" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtPct} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="best_avg_pnl" name="Best Avg %" stroke={PRIMARY} strokeWidth={3} dot={{ r: 3 }} />
        <Line yAxisId="left" type="monotone" dataKey="current_rule_avg_pnl" name="Current Avg %" stroke={SECONDARY} strokeWidth={3} dot={{ r: 3 }} />
        <Line yAxisId="right" type="monotone" dataKey="current_rule_rank" name="Current Rank" stroke={MUTED} strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function ResultTable({ rows }: { rows: Record<string, string | number>[] }) {
  if (!rows || rows.length === 0) return null
  const cols = Object.keys(rows[0])

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-slate-900/80">
          <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] sm:text-xs">
            {cols.map((c) => (
              <th key={c} className={`py-3 px-3 ${c === cols[0] ? 'text-left' : 'text-right'}`}>
                {humanizeColumn(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-800/70 hover:bg-slate-900/60 transition">
              {cols.map((c, j) => (
                <td
                  key={c}
                  className={`py-2.5 px-3 tabular-nums align-top ${
                    j === 0 ? 'text-left font-medium text-slate-100' : `text-right ${colorForCell(c, r[c])}`
                  }`}
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

function CustomTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean
  label?: string | number
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 shadow-xl">
      {label !== undefined ? <div className="text-xs text-slate-400 mb-2">{label}</div> : null}
      <div className="space-y-1">
        {payload.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4 text-xs">
            <span className="text-slate-300" style={{ color: item.color || '#cbd5e1' }}>
              {item.name}
            </span>
            <span className="tabular-nums text-white">{fmtTooltipValue(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function buildSummary(sim: SimResult): SummaryItem[] {
  const rows = sim.rows
  if (!rows?.length) return []

  if (sim.id === '01_feb5_position' || sim.id === '02_mitigation_variants') {
    const sorted = [...rows].sort((a, b) => toNumber(b.pnl_pct) - toNumber(a.pnl_pct))
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    return [
      {
        label: 'Best Variant',
        value: `${String(best.variant)} ${signedPct(toNumber(best.pnl_pct))}`,
        tone: toNumber(best.pnl_pct) >= 0 ? 'positive' : 'neutral',
      },
      {
        label: 'Worst Variant',
        value: `${String(worst.variant)} ${signedPct(toNumber(worst.pnl_pct))}`,
        tone: 'negative',
      },
      {
        label: 'Spread',
        value: signedPct(toNumber(best.pnl_pct) - toNumber(worst.pnl_pct)),
        hint: '최상위와 최하위 변형안의 차이',
        tone: toNumber(best.pnl_pct) - toNumber(worst.pnl_pct) >= 0 ? 'positive' : 'neutral',
      },
      {
        label: 'Min Events',
        value: `${Math.min(...rows.map((r) => toNumber(r.events)))}회`,
        hint: '과도한 이벤트 발생 여부 확인',
      },
    ]
  }

  if (sim.id === '03_multi_horizon' || sim.id === '04_adaptive_sizing') {
    const labelKey = sim.id === '03_multi_horizon' ? 'variant' : 'strategy'
    const sorted = [...rows].sort((a, b) => toNumber(b.avg) - toNumber(a.avg))
    const best = sorted[0]
    const current = rows.find((r) => String(r[labelKey]).includes('현재')) || rows[0]
    return [
      {
        label: 'Best Average',
        value: `${String(best[labelKey])} ${signedPct(toNumber(best.avg))}`,
        tone: toNumber(best.avg) >= 0 ? 'positive' : 'neutral',
      },
      {
        label: 'Current / Baseline',
        value: `${String(current[labelKey])} ${signedPct(toNumber(current.avg))}`,
        tone: toNumber(current.avg) >= 0 ? 'positive' : 'negative',
      },
      {
        label: 'Average Gap',
        value: signedPct(toNumber(best.avg) - toNumber(current.avg)),
        hint: '최선안과 기준안의 평균 차이',
        tone: toNumber(best.avg) - toNumber(current.avg) >= 0 ? 'positive' : 'negative',
      },
      {
        label: sim.id === '04_adaptive_sizing' ? 'Trades' : 'Worst Horizon',
        value: sim.id === '04_adaptive_sizing'
          ? `${toNumber(best.total_trades).toFixed(0)}회`
          : horizonWithLowestMean(rows),
        hint: sim.id === '04_adaptive_sizing' ? '최상위 전략 총 거래수' : '변형안 평균이 가장 낮은 지평',
      },
    ]
  }

  if (sim.id === '05_grid_search') {
    const top = rows[0]
    const spread = toNumber(top.best_pnl_pct) - toNumber(top.worst_pnl_pct)
    return [
      {
        label: 'Top Rule',
        value: `#${String(top.rank)} / rule ${String(top.rule_id)}`,
      },
      {
        label: 'Average PnL',
        value: signedPct(toNumber(top.avg_pnl_pct)),
        tone: toNumber(top.avg_pnl_pct) >= 0 ? 'positive' : 'negative',
      },
      {
        label: 'Worst Coin',
        value: signedPct(toNumber(top.worst_pnl_pct)),
        tone: 'negative',
      },
      {
        label: 'Best-Worst Spread',
        value: signedPct(spread),
        hint: '코인별 편차',
        tone: spread >= 0 ? 'positive' : 'neutral',
      },
    ]
  }

  if (sim.id === '06_interval_compare') {
    const bestInterval = [...rows].sort((a, b) => toNumber(b.best_avg_pnl) - toNumber(a.best_avg_pnl))[0]
    const currentInterval = [...rows].sort((a, b) => toNumber(b.current_rule_avg_pnl) - toNumber(a.current_rule_avg_pnl))[0]
    return [
      {
        label: 'Best Interval',
        value: `${String(bestInterval.label)} ${signedPct(toNumber(bestInterval.best_avg_pnl))}`,
        tone: 'positive',
      },
      {
        label: 'Current Rule Best',
        value: `${String(currentInterval.label)} ${signedPct(toNumber(currentInterval.current_rule_avg_pnl))}`,
        tone: toNumber(currentInterval.current_rule_avg_pnl) >= 0 ? 'positive' : 'negative',
      },
      {
        label: 'Largest Gap',
        value: formatLargestGap(rows),
        hint: '최적 룰과 현재 룰 차이가 가장 큰 인터벌',
      },
      {
        label: 'Daily Rank',
        value: `1일봉 현재 룰 ${signedPct(toNumber(rows.find((r) => r.interval === 'day')?.current_rule_avg_pnl))}`,
        hint: '인터벌 전환 효과를 빠르게 확인',
      },
    ]
  }

  if (sim.id === '11_longshort_horizons') {
    const horizons = Array.from(new Set(rows.map((r) => toNumber(r.horizon_days)))).sort((a, b) => a - b)
    const pivot = horizons.map((h) => {
      const hrows = rows.filter((r) => toNumber(r.horizon_days) === h)
      const get = (m: string) => toNumber((hrows.find((r) => r.mode === m) || {}).avg_pnl_pct)
      return { h, long: get('long'), short: get('short'), ls: get('long_short') }
    })
    const bestLong = [...pivot].sort((a, b) => b.long - a.long)[0]
    const bestShort = [...pivot].sort((a, b) => b.short - a.short)[0]
    const maxGap = pivot.reduce((acc, p) => {
      const gap = p.ls - p.long
      return Math.abs(gap) > Math.abs(acc.gap) ? { h: p.h, gap } : acc
    }, { h: 0, gap: 0 })
    return [
      {
        label: 'Best Long Horizon',
        value: `${bestLong.h}일 ${signedPct(bestLong.long)}`,
        tone: bestLong.long >= 0 ? 'positive' : 'negative',
      },
      {
        label: 'Best Short Horizon',
        value: `${bestShort.h}일 ${signedPct(bestShort.short)}`,
        tone: bestShort.short > 0 ? 'positive' : 'neutral',
        hint: '공매도가 유리했던 지평',
      },
      {
        label: 'L+S vs Long 최대 격차',
        value: `${maxGap.h}일 ${signedPct(maxGap.gap)}`,
        tone: maxGap.gap >= 0 ? 'positive' : 'negative',
        hint: '공매도 추가 효과의 극단 지평',
      },
      {
        label: 'Horizons Tested',
        value: `${horizons.length}개`,
        hint: horizons.map((h) => `${h}일`).join(', '),
      },
    ]
  }

  if (sim.id === '10_longshort') {
    const byPnl = [...rows].sort((a, b) => toNumber(b.avg_pnl_pct) - toNumber(a.avg_pnl_pct))
    const best = byPnl[0]
    const worstDD = [...rows].sort((a, b) => toNumber(a.avg_max_dd_pct) - toNumber(b.avg_max_dd_pct))[0]
    const longRow = rows.find((r) => String(r.mode) === 'long')
    const shortRow = rows.find((r) => String(r.mode) === 'short')
    const lsRow = rows.find((r) => String(r.mode) === 'long_short')
    const deltaLs = lsRow && longRow ? toNumber(lsRow.avg_pnl_pct) - toNumber(longRow.avg_pnl_pct) : 0
    return [
      {
        label: 'Best Mode',
        value: `${best.mode} ${signedPct(toNumber(best.avg_pnl_pct))}`,
        tone: toNumber(best.avg_pnl_pct) >= 0 ? 'positive' : 'negative',
      },
      {
        label: 'Long vs L+S 갭',
        value: signedPct(deltaLs),
        tone: deltaLs >= 0 ? 'positive' : 'negative',
        hint: '공매도 추가가 얼마나 도움/손해였는지',
      },
      {
        label: 'Short-only',
        value: shortRow ? signedPct(toNumber(shortRow.avg_pnl_pct)) : '-',
        tone: shortRow && toNumber(shortRow.avg_pnl_pct) >= 0 ? 'positive' : 'negative',
        hint: '공매도만으로 운용한 경우',
      },
      {
        label: 'Worst Drawdown',
        value: `${worstDD.mode} ${signedPct(toNumber(worstDD.avg_max_dd_pct))}`,
        tone: 'negative',
        hint: '모드별 평균 낙폭',
      },
    ]
  }

  if (sim.id === '09_cycle4h') {
    const byPnl = [...rows].sort((a, b) => toNumber(b.avg_pnl_pct) - toNumber(a.avg_pnl_pct))
    const bestPnl = byPnl[0]
    const worstDD = [...rows].sort((a, b) => toNumber(a.avg_max_dd_pct) - toNumber(b.avg_max_dd_pct))[0]
    return [
      {
        label: 'Best Cycle',
        value: `${formatHoursLabel(toNumber(bestPnl.cycle_hours))} ${signedPct(toNumber(bestPnl.avg_pnl_pct))}`,
        tone: toNumber(bestPnl.avg_pnl_pct) >= 0 ? 'positive' : 'negative',
      },
      {
        label: 'Worst Drawdown',
        value: `${formatHoursLabel(toNumber(worstDD.cycle_hours))} ${signedPct(toNumber(worstDD.avg_max_dd_pct))}`,
        tone: 'negative',
      },
      {
        label: 'Trade Volume Swing',
        value: `${toNumber(rows[0].total_buys)} → ${toNumber(rows[rows.length - 1].total_buys)}`,
        hint: '짧은 주기 → 긴 주기 매수 수 변화',
      },
      {
        label: 'Signal Source',
        value: '4시간봉',
        hint: '일봉 대비 신호 빈도 6배',
      },
    ]
  }

  if (sim.id === '08_cycle_freq') {
    const byPnl = [...rows].sort((a, b) => toNumber(b.avg_pnl_pct) - toNumber(a.avg_pnl_pct))
    const bestPnl = byPnl[0]
    const worstDD = [...rows].sort((a, b) => toNumber(a.avg_max_dd_pct) - toNumber(b.avg_max_dd_pct))[0]
    const current = rows.find((r) => toNumber(r.freq_minutes) === 480) || rows.find((r) => toNumber(r.freq_minutes) === 60)
    return [
      {
        label: 'Best P&L Cycle',
        value: `${formatFreqLabel(toNumber(bestPnl.freq_minutes))} ${signedPct(toNumber(bestPnl.avg_pnl_pct))}`,
        tone: toNumber(bestPnl.avg_pnl_pct) >= 0 ? 'positive' : 'negative',
      },
      {
        label: 'Lowest Drawdown',
        value: `${formatFreqLabel(toNumber(worstDD.freq_minutes))} ${signedPct(toNumber(worstDD.avg_max_dd_pct))}`,
        tone: 'neutral',
      },
      {
        label: 'Applied Cycle',
        value: current
          ? `${formatFreqLabel(toNumber(current.freq_minutes))} ${signedPct(toNumber(current.avg_pnl_pct))}`
          : '-',
        hint: '현재 운영 중인 주기',
      },
      {
        label: 'Buys vs Sells',
        value: `${toNumber(bestPnl.total_buys)} / ${toNumber(bestPnl.total_sells)}`,
        hint: '최적 주기 기준 (min_hold 24h 작동)',
      },
    ]
  }

  if (sim.id === '07_daily_horizons') {
    const best = [...rows].sort((a, b) => toNumber(b.best_avg_pnl) - toNumber(a.best_avg_pnl))[0]
    const current = [...rows].sort((a, b) => toNumber(b.current_rule_avg_pnl) - toNumber(a.current_rule_avg_pnl))[0]
    return [
      {
        label: 'Best Horizon',
        value: `${String(best.horizon_days)}일 ${signedPct(toNumber(best.best_avg_pnl))}`,
        tone: toNumber(best.best_avg_pnl) >= 0 ? 'positive' : 'neutral',
      },
      {
        label: 'Current Rule Best',
        value: `${String(current.horizon_days)}일 ${signedPct(toNumber(current.current_rule_avg_pnl))}`,
        tone: toNumber(current.current_rule_avg_pnl) >= 0 ? 'positive' : 'negative',
      },
      {
        label: 'Longest Horizon',
        value: `${String(rows[rows.length - 1].horizon_days)}일`,
        hint: '현재 데이터 기준 최대 일봉 지평',
      },
      {
        label: 'Best Rank Floor',
        value: `${Math.min(...rows.map((r) => toNumber(r.current_rule_rank))).toFixed(0)}위`,
        hint: '현재 룰 최고 순위',
      },
    ]
  }

  return []
}

function formatLargestGap(rows: Record<string, string | number>[]) {
  const data = rows
    .map((row) => ({
      label: String(row.label),
      gap: toNumber(row.best_avg_pnl) - toNumber(row.current_rule_avg_pnl),
    }))
    .sort((a, b) => b.gap - a.gap)[0]
  return `${data.label} ${signedPct(data.gap)}`
}

function horizonWithLowestMean(rows: Record<string, string | number>[]) {
  const horizonKeys = Object.keys(rows[0]).filter((k) => /^d\d+$/i.test(k))
  const points = horizonKeys.map((key) => {
    const values = rows.map((row) => toNumber(row[key]))
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length
    return { key, avg }
  })
  const worst = points.sort((a, b) => a.avg - b.avg)[0]
  return worst.key.replace(/^d/i, '') + '일'
}

function toNumber(value: string | number | undefined) {
  if (typeof value === 'number') return value
  if (!value) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function humanizeColumn(col: string) {
  return col
    .replace(/_/g, ' ')
    .replace(/\bpnl pct\b/gi, 'PnL %')
    .replace(/\bavg\b/gi, 'Avg')
    .replace(/\bd(\d+)\b/gi, '$1d')
}

function fmtPct(n: number) {
  return `${n.toFixed(0)}%`
}

function signedPct(n: number) {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

function fmtTooltipValue(value: string | number | undefined) {
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1000) return value.toLocaleString('ko-KR')
    return value % 1 === 0 ? value.toString() : value.toFixed(2)
  }
  return String(value ?? '-')
}

function isNumeric(value: unknown): value is number | string {
  return typeof value === 'number' || (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value)))
}

function looksLikePercentColumn(col: string) {
  return /(pnl|avg|dd|change|d\d+|pct|return|gap)/i.test(col)
}

function fmtValue(col: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (!isNumeric(value)) return String(value)

  const n = typeof value === 'number' ? value : Number(value)
  if (looksLikePercentColumn(col)) return signedPct(n)
  if (/rank|events|trades|rule_id|horizon_days/i.test(col)) return Number.isInteger(n) ? n.toString() : n.toFixed(0)
  if (/backstop|trailing|min_profit|base_pct/i.test(col)) return n.toFixed(3)
  return Number.isInteger(n) ? n.toLocaleString('ko-KR') : n.toFixed(2)
}

function colorForCell(col: string, value: unknown) {
  if (!isNumeric(value) || !looksLikePercentColumn(col)) return 'text-slate-200'
  const n = typeof value === 'number' ? value : Number(value)
  if (n > 0) return 'text-emerald-400'
  if (n < 0) return 'text-red-400'
  return 'text-slate-300'
}
