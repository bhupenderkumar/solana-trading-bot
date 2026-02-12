import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import api from '../services/api'
import { useDriftTrading } from './useDriftTrading'

interface PendingTrade {
  id: number
  rule_id?: number
  wallet_address: string
  market: string
  side: 'buy' | 'sell'
  size: number
  price_at_trigger: number
  title: string
  message: string
  status: string
  created_at: string
  expires_at?: string
}

export function usePendingTrades() {
  const { publicKey, connected } = useWallet()
  const { placeOrder, isWalletConnected } = useDriftTrading()
  const [pendingTrades, setPendingTrades] = useState<PendingTrade[]>([])
  const [loading, setLoading] = useState(false)

  const fetchPendingTrades = useCallback(async () => {
    if (!publicKey || !connected) {
      setPendingTrades([])
      return
    }

    try {
      const response = await api.get<PendingTrade[]>('/api/pending-trades', {
        params: {
          wallet_address: publicKey.toBase58(),
          status: 'pending'
        }
      })
      setPendingTrades(response.data)
    } catch (error) {
      console.error('Failed to fetch pending trades:', error)
    }
  }, [publicKey, connected])

  // Poll for pending trades every 10 seconds
  useEffect(() => {
    if (!connected) return

    fetchPendingTrades()
    const interval = setInterval(fetchPendingTrades, 10000)
    return () => clearInterval(interval)
  }, [fetchPendingTrades, connected])

  const approveTrade = useCallback(async (trade: PendingTrade) => {
    if (!publicKey) return { success: false, error: 'Wallet not connected' }
    if (!isWalletConnected) return { success: false, error: 'Wallet not connected' }

    setLoading(true)
    try {
      // Execute the trade via Drift Protocol SDK (real transaction!)
      const result = await placeOrder({
        market: trade.market,
        side: trade.side,
        size: trade.size,
      })

      if (result.success && result.signature) {
        // Notify backend of approval with REAL tx signature
        await api.post(`/api/pending-trades/${trade.id}/approve`, {
          tx_signature: result.signature,
          executed_price: trade.price_at_trigger // Will be updated with actual price
        })

        // Refresh pending trades
        await fetchPendingTrades()
        return { success: true }
      } else {
        return { success: false, error: result.error || 'Transaction failed' }
      }
    } catch (error: any) {
      console.error('Failed to approve trade:', error)
      return { success: false, error: error.message || 'Failed to approve trade' }
    } finally {
      setLoading(false)
    }
  }, [publicKey, placeOrder, fetchPendingTrades])

  const rejectTrade = useCallback(async (tradeId: number) => {
    setLoading(true)
    try {
      await api.post(`/api/pending-trades/${tradeId}/reject`)
      await fetchPendingTrades()
      return { success: true }
    } catch (error: any) {
      console.error('Failed to reject trade:', error)
      return { success: false, error: error.message }
    } finally {
      setLoading(false)
    }
  }, [fetchPendingTrades])

  return {
    pendingTrades,
    pendingCount: pendingTrades.length,
    loading,
    approveTrade,
    rejectTrade,
    refresh: fetchPendingTrades
  }
}
