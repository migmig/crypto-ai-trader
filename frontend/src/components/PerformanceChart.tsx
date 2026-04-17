import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { PerfRecord } from '../types'

interface Props {
  data: PerfRecord[]
}

export default function PerformanceChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-base font-semibold mb-4">Performance</h2>
        <div className="text-gray-500 text-center py-8 text-sm">No performance data yet</div>
      </div>
    )
  }

  const chartData = data.map(p => ({
    time: new Date(p.timestamp).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    total: Number(p.total_value),
    pl_pct: (Number(p.pl_pct) * 100).toFixed(2),
  }))

  const initial = data.length > 0 ? Number(data[0].total_value) : 10000000

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-base font-semibold mb-4">Performance</h2>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `${(v / 10000).toFixed(0)}만`}
            domain={['dataMin - 50000', 'dataMax + 50000']}
          />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 13 }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={(value) => [`\u20a9${Number(value).toLocaleString()}`, 'Total']}
          />
          <ReferenceLine y={initial} stroke="#374151" strokeDasharray="4 4" />
          <Area type="monotone" dataKey="total" stroke="#60a5fa" strokeWidth={2} fill="url(#grad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
