import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Toast {
  id: number
  ts: number
  action: string
  market: string
  price: number
  qty: number
  reason?: string
}

let nextId = 1
const DURATION = 8000

export default function TradeToaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    if (!supabase) return
    const ch = supabase
      .channel('trade_log:ins')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trade_log' },
        (payload) => {
          const r = payload.new as Record<string, unknown>
          const toast: Toast = {
            id: nextId++, ts: Date.now(),
            action: String(r.action ?? ''),
            market: String(r.market ?? ''),
            price: Number(r.price ?? 0),
            qty: Number(r.qty ?? 0),
            reason: typeof r.reason === 'string' ? r.reason : undefined,
          }
          setToasts((t) => [...t, toast])
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toast.id)), DURATION)
        },
      )
      .subscribe()
    return () => { supabase?.removeChannel(ch) }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((t) => {
        const isBuy = t.action === 'buy'
        return (
          <div
            key={t.id}
            className={`rounded-xl border shadow-2xl px-4 py-3 backdrop-blur animate-in fade-in slide-in-from-right-4 ${
              isBuy
                ? 'bg-emerald-950/90 border-emerald-500/40'
                : 'bg-red-950/90 border-red-500/40'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold uppercase tracking-wider ${isBuy ? 'text-emerald-300' : 'text-red-300'}`}>
                {isBuy ? '▲ 매수' : '▽ 매도'}
              </span>
              <span className="text-white font-semibold">{t.market.replace('KRW-', '')}</span>
              <span className="text-xs text-slate-400 ml-auto">방금</span>
            </div>
            <div className="text-sm text-slate-200 tabular-nums">
              ₩{Math.round(t.price).toLocaleString()} × {t.qty.toFixed(6)}
            </div>
            {t.reason && (
              <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">{t.reason}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
