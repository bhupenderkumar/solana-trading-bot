import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

// Log the API URL being used (helpful for debugging)
console.log('API Base URL:', API_BASE_URL)
if (API_BASE_URL === '/api') {
  console.warn('VITE_API_URL is not set. API calls may fail if backend is on a different domain.')
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Response interceptor to detect HTML responses (misconfigured API URL)
api.interceptors.response.use(
  (response) => {
    // Check if we received HTML instead of JSON (common when VITE_API_URL is wrong)
    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
      console.error('API returned HTML instead of JSON. Check VITE_API_URL configuration.')
      throw new Error('API configuration error: Received HTML instead of JSON. Please check VITE_API_URL.')
    }
    return response
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Types
export interface TradingRule {
  id: number
  conversation_id: number | null
  wallet_address: string | null
  user_input: string
  parsed_summary: string | null
  market: string
  condition_type: string
  condition_value: number
  reference_price: number | null
  action_type: string
  action_amount_percent: number | null
  action_amount_usd: number | null
  status: 'active' | 'paused' | 'triggered' | 'expired'
  created_at: string
  triggered_at: string | null
}

export interface JobLog {
  id: number
  rule_id: number
  checked_at: string
  current_price: number | null
  condition_met: boolean
  message: string | null
  error: string | null
}

export interface Trade {
  id: number
  rule_id: number | null
  market: string
  side: string
  size: number
  price: number
  tx_signature: string | null
  status: string | null
  executed_at: string
}

export interface Prices {
  [market: string]: number
}

// Conversation types
export interface ConversationStats {
  total_rules: number
  active_rules: number
  triggered_rules: number
  paused_rules: number
}

export interface Conversation {
  id: number
  title: string
  created_at: string
  updated_at: string | null
  stats: ConversationStats
}

export interface ChatMessage {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  intent: string | null
  data: Record<string, any> | null
  created_at: string
}

// Chat API types
export interface ChatResponse {
  intent: string
  response: string
  data?: Record<string, any> | null
  should_create_rule: boolean
  original_input?: string | null
  conversation_id?: number
  message_id?: number
}

// Helper to ensure array response
function ensureArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data
  console.warn('Expected array but got:', typeof data, data)
  return []
}

// Conversation API
export const conversationApi = {
  list: async (walletAddress?: string): Promise<Conversation[]> => {
    const params = walletAddress ? { wallet_address: walletAddress } : {}
    const { data } = await api.get('/chat/conversations', { params })
    return ensureArray<Conversation>(data)
  },

  create: async (title?: string, walletAddress?: string): Promise<Conversation> => {
    const { data } = await api.post('/chat/conversations', { title, wallet_address: walletAddress })
    return data
  },

  get: async (id: number): Promise<Conversation & { messages: ChatMessage[] }> => {
    const { data } = await api.get(`/chat/conversations/${id}`)
    return data
  },

  update: async (id: number, title: string): Promise<Conversation> => {
    const { data } = await api.patch(`/chat/conversations/${id}`, { title })
    return data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/chat/conversations/${id}`)
  },
}

export const chatApi = {
  send: async (message: string, walletAddress?: string): Promise<ChatResponse> => {
    const { data } = await api.post('/chat/', { message, wallet_address: walletAddress })
    return data
  },

  sendWithConversation: async (message: string, conversationId?: number, walletAddress?: string): Promise<ChatResponse> => {
    const { data } = await api.post('/chat/', { 
      message, 
      conversation_id: conversationId,
      wallet_address: walletAddress 
    })
    return data
  },

  getPrices: async (): Promise<Prices> => {
    const { data } = await api.get('/chat/prices')
    return data.prices
  },

  getBalance: async (): Promise<{ total_usd: number; available_usd: number; simulation_mode: boolean }> => {
    const { data } = await api.get('/chat/balance')
    return data
  },

  getPositions: async (): Promise<{ positions: any[]; simulation_mode: boolean }> => {
    const { data } = await api.get('/chat/positions')
    return data
  },
}

// API functions
export const rulesApi = {
  create: async (input: string, walletAddress?: string): Promise<TradingRule> => {
    const { data } = await api.post('/rules/', { input, wallet_address: walletAddress })
    return data
  },

  createWithConversation: async (input: string, conversationId?: number, walletAddress?: string): Promise<TradingRule> => {
    const { data } = await api.post('/rules/', { 
      input, 
      conversation_id: conversationId,
      wallet_address: walletAddress 
    })
    return data
  },

  list: async (status?: string, walletAddress?: string): Promise<TradingRule[]> => {
    const params: Record<string, string> = {}
    if (status) params.status_filter = status
    if (walletAddress) params.wallet_address = walletAddress
    const { data } = await api.get('/rules/', { params })
    return ensureArray<TradingRule>(data)
  },

  get: async (id: number): Promise<TradingRule> => {
    const { data } = await api.get(`/rules/${id}`)
    return data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/rules/${id}`)
  },

  toggle: async (id: number): Promise<TradingRule> => {
    const { data } = await api.post(`/rules/${id}/toggle`)
    return data
  },

  getLogs: async (id: number, limit = 50): Promise<JobLog[]> => {
    const { data } = await api.get(`/rules/${id}/logs`, { params: { limit } })
    return ensureArray<JobLog>(data)
  },

  getTrades: async (id: number): Promise<Trade[]> => {
    const { data } = await api.get(`/rules/${id}/trades`)
    return ensureArray<Trade>(data)
  },
}

// Trades API - centralized trades endpoint
export const tradesApi = {
  list: async (limit = 100, walletAddress?: string): Promise<Trade[]> => {
    const params: Record<string, string | number> = { limit }
    if (walletAddress) params.wallet_address = walletAddress
    const { data } = await api.get('/trades/', { params })
    return ensureArray<Trade>(data)
  },
}

// Historical price types
export interface HistoricalPriceData {
  market: string
  coin_id: string
  currency: string
  days: number
  prices: [number, number][] // [timestamp, price]
  market_caps: [number, number][]
  total_volumes: [number, number][]
  fetched_at: string
}

export interface PriceStatistics {
  market: string
  currency: string
  days: number
  current_price: number
  start_price: number
  high_price: number
  low_price: number
  average_price: number
  price_change: number
  price_change_percent: number
  volatility: number
  data_points: number
}

export interface OHLCPoint {
  timestamp: number
  date: string
  open: number
  high: number
  low: number
  close: number
}

export interface OHLCData {
  market: string
  coin_id: string
  currency: string
  days: number
  ohlc: OHLCPoint[]
  fetched_at: string
}

export interface CurrentPriceWithHistory {
  market: string
  coin_id: string
  name: string | null
  symbol: string
  current_price: number | null
  price_change_24h: number | null
  price_change_percentage_24h: number | null
  price_change_percentage_7d: number | null
  price_change_percentage_30d: number | null
  market_cap: number | null
  market_cap_rank: number | null
  total_volume: number | null
  high_24h: number | null
  low_24h: number | null
  ath: number | null
  ath_date: string | null
  atl: number | null
  atl_date: string | null
  sparkline_7d: number[]
  last_updated: string | null
  currency: string
}

export interface SupportedMarket {
  market: string
  coin_id: string
}

export const pricesApi = {
  getAll: async (): Promise<Prices> => {
    const { data } = await api.get('/prices/')
    return data
  },

  get: async (market: string): Promise<{ market: string; price: number }> => {
    const { data } = await api.get(`/prices/${market}`)
    return data
  },

  // Historical price endpoints
  getSupportedMarkets: async (): Promise<SupportedMarket[]> => {
    const { data } = await api.get('/prices/supported-markets')
    return ensureArray<SupportedMarket>(data)
  },

  getHistoricalPrices: async (
    market: string,
    days: number = 20,
    currency: string = 'usd'
  ): Promise<HistoricalPriceData> => {
    const { data } = await api.get(`/prices/history/${market}`, {
      params: { days, currency }
    })
    // Ensure prices array exists
    return {
      ...data,
      prices: Array.isArray(data?.prices) ? data.prices : [],
      market_caps: Array.isArray(data?.market_caps) ? data.market_caps : [],
      total_volumes: Array.isArray(data?.total_volumes) ? data.total_volumes : [],
    }
  },

  getPriceStatistics: async (
    market: string,
    days: number = 20,
    currency: string = 'usd'
  ): Promise<PriceStatistics> => {
    const { data } = await api.get(`/prices/history/${market}/statistics`, {
      params: { days, currency }
    })
    return data
  },

  getOHLCData: async (
    market: string,
    days: number = 20,
    currency: string = 'usd'
  ): Promise<OHLCData> => {
    const { data } = await api.get(`/prices/history/${market}/ohlc`, {
      params: { days, currency }
    })
    // Ensure ohlc array exists
    return {
      ...data,
      ohlc: Array.isArray(data?.ohlc) ? data.ohlc : [],
    }
  },

  getCurrentPriceWithHistory: async (
    market: string,
    currency: string = 'usd'
  ): Promise<CurrentPriceWithHistory> => {
    const { data } = await api.get(`/prices/history/${market}/detailed`, {
      params: { currency }
    })
    return data
  },

  getMultipleHistoricalPrices: async (
    markets: string[],
    days: number = 20,
    currency: string = 'usd'
  ): Promise<Record<string, HistoricalPriceData>> => {
    const { data } = await api.get('/prices/history/multiple', {
      params: { markets: markets.join(','), days, currency }
    })
    return data
  },

  clearCache: async (): Promise<{ message: string }> => {
    const { data } = await api.post('/prices/history/clear-cache')
    return data
  },
}

export const healthApi = {
  check: async (): Promise<{ status: string; drift_connected: boolean; scheduler_running: boolean }> => {
    const { data } = await api.get('/health')
    return data
  },
}

// Solana RPC for wallet balance and history
const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com'

export interface WalletBalance {
  sol: number
  lamports: number
}

export interface WalletTransaction {
  signature: string
  slot: number
  blockTime: number | null
  err: any | null
  memo: string | null
  confirmationStatus: string
}

export interface TransactionDetail {
  signature: string
  blockTime: number | null
  slot: number
  fee: number
  status: 'success' | 'failed'
  type: string
  amount?: number
  from?: string
  to?: string
}

export const walletApi = {
  // Get wallet balance
  getBalance: async (publicKey: string): Promise<WalletBalance> => {
    const response = await fetch(SOLANA_DEVNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [publicKey],
      }),
    })
    const result = await response.json()
    if (result.error) {
      throw new Error(result.error.message)
    }
    const lamports = result.result.value
    return {
      lamports,
      sol: lamports / 1_000_000_000, // Convert lamports to SOL
    }
  },

  // Get recent transactions
  getTransactions: async (publicKey: string, limit = 10): Promise<WalletTransaction[]> => {
    const response = await fetch(SOLANA_DEVNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [publicKey, { limit }],
      }),
    })
    const result = await response.json()
    if (result.error) {
      throw new Error(result.error.message)
    }
    return result.result || []
  },

  // Get transaction details
  getTransactionDetail: async (signature: string): Promise<TransactionDetail | null> => {
    const response = await fetch(SOLANA_DEVNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }),
    })
    const result = await response.json()
    if (result.error || !result.result) {
      return null
    }

    const tx = result.result
    const meta = tx.meta
    const message = tx.transaction?.message

    // Determine transaction type and extract details
    let type = 'unknown'
    let amount: number | undefined
    let from: string | undefined
    let to: string | undefined

    // Check for SOL transfer
    if (message?.instructions) {
      for (const ix of message.instructions) {
        if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
          type = 'transfer'
          amount = ix.parsed.info.lamports / 1_000_000_000
          from = ix.parsed.info.source
          to = ix.parsed.info.destination
          break
        }
      }
    }

    // If no parsed transfer, check balance changes
    if (type === 'unknown' && meta?.preBalances && meta?.postBalances) {
      const balanceChange = (meta.postBalances[0] - meta.preBalances[0]) / 1_000_000_000
      if (Math.abs(balanceChange) > 0.000001) {
        type = balanceChange > 0 ? 'receive' : 'send'
        amount = Math.abs(balanceChange)
      }
    }

    return {
      signature,
      blockTime: tx.blockTime,
      slot: tx.slot,
      fee: (meta?.fee || 0) / 1_000_000_000,
      status: meta?.err ? 'failed' : 'success',
      type,
      amount,
      from,
      to,
    }
  },

  // Request airdrop (devnet only)
  requestAirdrop: async (publicKey: string, amount = 1): Promise<string> => {
    const lamports = amount * 1_000_000_000
    const response = await fetch(SOLANA_DEVNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'requestAirdrop',
        params: [publicKey, lamports],
      }),
    })
    const result = await response.json()
    if (result.error) {
      throw new Error(result.error.message)
    }
    return result.result // Returns transaction signature
  },
}

// Auth types
export interface Wallet {
  public_key: string
  private_key: string
  message: string
}

export interface TokenResponse {
  token: string
  is_new: boolean
}

// Token management with localStorage
const TOKEN_KEY = 'trading_bot_token'
const WALLET_KEY = 'trading_bot_wallet'

export const authApi = {
  // Get or create token from localStorage
  getOrCreateToken: async (): Promise<TokenResponse> => {
    const existingToken = localStorage.getItem(TOKEN_KEY)
    const { data } = await api.post<TokenResponse>('/auth/token', {
      token: existingToken || undefined
    })

    // Save to localStorage
    localStorage.setItem(TOKEN_KEY, data.token)
    return data
  },

  // Get current token from localStorage
  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY)
  },

  // Clear token
  clearToken: (): void => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(WALLET_KEY)
  },

  // Create new wallet
  createWallet: async (): Promise<Wallet> => {
    const { data } = await api.post<Wallet>('/auth/wallet')
    // Save wallet (only public key) to localStorage
    localStorage.setItem(WALLET_KEY, JSON.stringify({
      public_key: data.public_key,
      created_at: new Date().toISOString()
    }))
    return data
  },

  // Get saved wallet from localStorage
  getSavedWallet: (): { public_key: string; created_at: string } | null => {
    const saved = localStorage.getItem(WALLET_KEY)
    return saved ? JSON.parse(saved) : null
  },

  // Link wallet to token
  linkWallet: async (walletPublicKey: string): Promise<void> => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) throw new Error('No token found')
    await api.post('/auth/link-wallet', null, {
      params: { token, wallet_public_key: walletPublicKey }
    })
  },

  // Validate token
  validateToken: async (): Promise<{ valid: boolean; data?: any }> => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return { valid: false }
    const { data } = await api.get(`/auth/validate/${token}`)
    return data
  },

  // Check if user is authenticated
  isAuthenticated: (): boolean => {
    return !!localStorage.getItem(TOKEN_KEY)
  },
}

export default api
