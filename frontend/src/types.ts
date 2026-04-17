export interface Holding {
  market: string
  coin: string
  qty: number
  avg_price: number
  current_price: number
  value: number
  cost: number
  pl: number
  pl_pct: number
  bought_at: string
}

export interface MarketItem {
  market: string
  coin: string
  price: number
  change_rate: number
  volume_24h: number
  rsi_15m: number | null
  rsi_1h: number | null
  macd_hist: number | null
  trend: string
  volume_ratio: number | null
}

export interface ActionItem {
  action: string
  market: string
  amount_krw?: number
  sell_pct?: number
  reason: string
}

export type SignalKind =
  | 'buy_strong'
  | 'buy'
  | 'hold'
  | 'sell'
  | 'sell_strong'

export interface PerCoinSnapshot {
  coin: string
  price: number | null
  change_pct: number
  trend: string
  rsi: { '15m': number | null; '1h': number | null; '1d': number | null }
  macd_hist_15m: number | null
  macd_hist_1h: number | null
  macd_prev_hist_15m?: number | null
  volume_ratio_15m: number | null
  bb_15m: { upper: number | null; lower: number | null }
  signal: SignalKind
  matched_rule: string | null
}

export interface ConditionCheck {
  name: string
  ok: boolean
  value?: unknown
}

export interface ConditionRule {
  rule: string
  signal: SignalKind
  matched: boolean
  checks: ConditionCheck[]
}

export interface ConditionsForCoin {
  coin: string
  signal: SignalKind
  rules: ConditionRule[]
}

export interface TriggerItem {
  coin: string
  rule: string
  missing: string[]
}

export interface LastAction {
  source?: string
  market_summary: string
  risk_assessment: string
  actions: ActionItem[]
  per_coin?: Record<string, PerCoinSnapshot>
  conditions_checked?: ConditionsForCoin[]
  triggers_next_cycle?: TriggerItem[]
  timestamp: string
}

export interface StatusData {
  cash: number
  holdings_value: number
  total: number
  initial_capital: number
  total_pl: number
  total_pl_pct: number
  holdings: Holding[]
  markets: MarketItem[]
  total_trades_today: number
  last_trade_time: string | null
  last_action: LastAction
  collected_at: string
  analyzed_at: string
}

export interface Trade {
  timestamp: string
  action: string
  market: string
  qty: string
  price: string
  amount_krw: string
  fee: string
  reason: string
  result: string
  cash_after: string
}

export interface PerfRecord {
  timestamp: string
  cash: string
  holdings_value: string
  total_value: string
  pl_krw: string
  pl_pct: string
  num_holdings: string
}

export interface CycleLog {
  timestamp: string
  status: 'ok' | 'error' | 'running'
  tags: string[]
  body: string
  line_count: number
}

export interface Judgment {
  timestamp: string
  source?: string
  actions: ActionItem[]
  market_summary: string
  risk_assessment: string
  per_coin?: Record<string, PerCoinSnapshot>
  conditions_checked?: ConditionsForCoin[]
  triggers_next_cycle?: TriggerItem[]
}
