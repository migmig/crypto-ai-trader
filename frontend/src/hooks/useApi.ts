import { useState, useEffect, useCallback, useRef } from 'react'
import type { StatusData, Trade, PerfRecord, Judgment, CycleLog, JudgmentStats } from '../types'

const PAGE_SIZE = 50

export function useApi(interval = 30000) {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [performance, setPerformance] = useState<PerfRecord[]>([])
  const [judgments, setJudgments] = useState<Judgment[]>([])
  const [judgmentsTotal, setJudgmentsTotal] = useState(0)
  const [judgmentsHasMore, setJudgmentsHasMore] = useState(false)
  const [judgmentsStats, setJudgmentsStats] = useState<JudgmentStats | null>(null)
  const [logs, setLogs] = useState<CycleLog[]>([])
  const [loading, setLoading] = useState(true)
  const loadingMoreRef = useRef(false)

  const fetchAll = useCallback(async () => {
    try {
      const [s, t, p, j, l, js] = await Promise.all([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/trades').then(r => r.json()),
        fetch('/api/performance').then(r => r.json()),
        fetch(`/api/judgments?offset=0&limit=${PAGE_SIZE}`).then(r => r.json()),
        fetch('/api/logs').then(r => r.json()),
        fetch('/api/judgments/stats').then(r => r.json()),
      ])
      setStatus(s)
      setTrades(t)
      setPerformance(p)
      // items/total/has_more 페이지네이션 응답
      if (j && Array.isArray(j.items)) {
        setJudgments(j.items)
        setJudgmentsTotal(j.total || j.items.length)
        setJudgmentsHasMore(!!j.has_more)
      } else if (Array.isArray(j)) {
        // 구버전 호환
        setJudgments(j)
        setJudgmentsTotal(j.length)
        setJudgmentsHasMore(false)
      }
      setLogs(l)
      if (js && typeof js.total === 'number') setJudgmentsStats(js)
    } catch (e) {
      console.error('API error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMoreJudgments = useCallback(async () => {
    if (loadingMoreRef.current || !judgmentsHasMore) return
    loadingMoreRef.current = true
    try {
      const offset = judgments.length
      const r = await fetch(`/api/judgments?offset=${offset}&limit=${PAGE_SIZE}`).then(r => r.json())
      if (r && Array.isArray(r.items)) {
        setJudgments((prev) => [...prev, ...r.items])
        setJudgmentsTotal(r.total || 0)
        setJudgmentsHasMore(!!r.has_more)
      }
    } catch (e) {
      console.error('loadMore error:', e)
    } finally {
      loadingMoreRef.current = false
    }
  }, [judgments.length, judgmentsHasMore])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, interval)
    return () => clearInterval(id)
  }, [fetchAll, interval])

  return {
    status, trades, performance, judgments, logs, loading, refresh: fetchAll,
    judgmentsTotal, judgmentsHasMore, loadMoreJudgments, judgmentsStats,
  }
}
