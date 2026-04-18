export function fmt(n: number | null | undefined): string {
  if (n == null) return '-'
  return Number(n).toLocaleString('ko-KR')
}

export function fmtWon(n: number): string {
  return '\u20a9' + fmt(n)
}

export function plColor(v: number): string {
  if (v > 0) return 'text-emerald-400'
  if (v < 0) return 'text-red-400'
  return 'text-gray-400'
}

export function plSign(v: number): string {
  return v >= 0 ? '+' : ''
}

export function timeAgo(ts: string | null): string {
  if (!ts) return ''
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60) return Math.floor(diff) + 's ago'
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  return Math.floor(diff / 86400) + 'd ago'
}

export function shortTime(ts: string): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function fmtSummary(text: string): string {
  if (!text) return ''
  text = text.replace(/\.\s*(BTC|ETH|XRP|SOL|DOGE|ADA|AVAX|DOT|LINK|SUI|전체|전 종목)/g, '.\n\n$1')
  text = text.replace(/\.\s+/g, '.\n')
  return text
}

export function rsiColor(v: number): string {
  if (v <= 30) return 'text-emerald-400'
  if (v >= 70) return 'text-red-400'
  if (v <= 40) return 'text-emerald-300'
  if (v >= 60) return 'text-red-300'
  return 'text-blue-400'
}

export function rsiBg(v: number): string {
  if (v <= 30) return 'bg-emerald-400'
  if (v >= 70) return 'bg-red-400'
  if (v <= 40) return 'bg-emerald-300'
  if (v >= 60) return 'bg-red-300'
  return 'bg-blue-400'
}

export function trendColor(t: string): string {
  if (t.includes('상승')) return 'text-emerald-400'
  if (t.includes('하락')) return 'text-red-400'
  return 'text-yellow-400'
}

export function signalLabel(s: string | null | undefined): string {
  switch (s) {
    case 'buy_strong': return '적극매수'
    case 'buy': return '매수'
    case 'sell_strong': return '적극매도'
    case 'sell': return '매도'
    case 'hold': return '관망'
    default: return s || '-'
  }
}

export function signalClass(s: string | null | undefined): string {
  switch (s) {
    case 'buy_strong': return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
    case 'buy': return 'bg-emerald-900/50 text-emerald-300 border border-emerald-800'
    case 'sell_strong': return 'bg-red-500/20 text-red-300 border border-red-500/40'
    case 'sell': return 'bg-red-900/50 text-red-300 border border-red-800'
    case 'hold': return 'bg-slate-800 text-gray-400 border border-slate-700'
    default: return 'bg-slate-800 text-gray-400'
  }
}

export function sourceBadge(src?: string): { label: string; cls: string } {
  if (src === 'ai') return { label: 'AI', cls: 'bg-purple-900/50 text-purple-300 border border-purple-800' }
  if (src === 'algo') return { label: 'ALGO', cls: 'bg-slate-800 text-gray-300 border border-slate-700' }
  return { label: src || '?', cls: 'bg-slate-800 text-gray-500 border border-slate-700' }
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null) return '-'
  return Number(n).toFixed(digits)
}
