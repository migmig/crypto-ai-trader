import { useState, useEffect, useCallback } from 'react'
import type { StatusData, Trade, PerfRecord, Judgment } from '../types'

export function useApi(interval = 30000) {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [performance, setPerformance] = useState<PerfRecord[]>([])
  const [judgments, setJudgments] = useState<Judgment[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const [s, t, p, j] = await Promise.all([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/trades').then(r => r.json()),
        fetch('/api/performance').then(r => r.json()),
        fetch('/api/judgments').then(r => r.json()),
      ])
      setStatus(s)
      setTrades(t)
      setPerformance(p)
      setJudgments(j)
    } catch (e) {
      console.error('API error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, interval)
    return () => clearInterval(id)
  }, [fetchAll, interval])

  return { status, trades, performance, judgments, loading, refresh: fetchAll }
}
