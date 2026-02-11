import { useState, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Transaction, VersionedTransaction } from '@solana/web3.js'
import api from '../services/api'

interface OrderParams {
  market: string // e.g., "SOL-PERP"
  side: 'buy' | 'sell'
  size: number
  price?: number
  orderType?: 'market' | 'limit'
}

interface TransactionResult {
  success: boolean
  signature?: string
  explorerUrl?: string
  error?: string
}

interface BuildOrderResponse {
  success: boolean
  transaction?: string
  transaction_type: string
  message: string
  details: Record<string, any>
  simulation: Record<string, any>
  requires_signature: boolean
  signer: string
  error?: string
  mock_mode?: boolean
}

interface Position {
  market: string
  market_index: number
  size: number
  side: 'long' | 'short'
  entry_price: number
  unrealized_pnl: number
}

export function useDriftTrading() {
  const { publicKey, signTransaction, connected } = useWallet()
  const { connection } = useConnection()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTransaction, setLastTransaction] = useState<TransactionResult | null>(null)

  /**
   * Build and sign an order transaction
   */
  const placeOrder = useCallback(async (params: OrderParams): Promise<TransactionResult> => {
    if (!publicKey || !signTransaction || !connected) {
      return {
        success: false,
        error: 'Wallet not connected. Please connect your wallet first.',
      }
    }

    setLoading(true)
    setError(null)

    try {
      // 1. Request unsigned transaction from backend
      const response = await api.post<BuildOrderResponse>('/api/transactions/build-order', {
        user_pubkey: publicKey.toBase58(),
        market: params.market,
        side: params.side,
        size: params.size,
        price: params.price,
        order_type: params.orderType || 'market',
      })

      if (!response.data.success || !response.data.transaction) {
        throw new Error(response.data.error || 'Failed to build transaction')
      }

      // Check if mock mode
      if (response.data.mock_mode) {
        console.log('Mock transaction (Drift SDK not available):', response.data.message)
        const mockResult: TransactionResult = {
          success: true,
          signature: 'mock_' + Date.now(),
          explorerUrl: `https://explorer.solana.com/tx/mock?cluster=devnet`,
        }
        setLastTransaction(mockResult)
        return mockResult
      }

      // 2. Decode the transaction
      const txBuffer = Buffer.from(response.data.transaction, 'base64')
      let transaction: Transaction | VersionedTransaction

      try {
        // Try parsing as versioned transaction first
        transaction = VersionedTransaction.deserialize(txBuffer)
      } catch {
        // Fall back to legacy transaction
        transaction = Transaction.from(txBuffer)
      }

      // 3. Sign with wallet
      console.log('Requesting wallet signature...')
      const signedTx = await signTransaction(transaction)

      // 4. Serialize signed transaction
      const signedTxBuffer = signedTx.serialize()
      const signedTxBase64 = Buffer.from(signedTxBuffer).toString('base64')

      // 5. Submit to backend (which submits to Solana)
      const submitResponse = await api.post<{
        success: boolean
        signature?: string
        explorer_url?: string
        error?: string
      }>('/api/transactions/submit', {
        signed_transaction: signedTxBase64,
        user_pubkey: publicKey.toBase58(),
      })

      if (!submitResponse.data.success) {
        throw new Error(submitResponse.data.error || 'Failed to submit transaction')
      }

      const result: TransactionResult = {
        success: true,
        signature: submitResponse.data.signature,
        explorerUrl: submitResponse.data.explorer_url,
      }

      setLastTransaction(result)
      return result

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed'
      setError(errorMessage)
      console.error('Order error:', err)
      
      const result: TransactionResult = {
        success: false,
        error: errorMessage,
      }
      setLastTransaction(result)
      return result

    } finally {
      setLoading(false)
    }
  }, [publicKey, signTransaction, connected])

  /**
   * Get user's positions
   */
  const getPositions = useCallback(async (): Promise<Position[]> => {
    if (!publicKey) return []

    try {
      const response = await api.get<Position[]>(
        `/api/transactions/positions/${publicKey.toBase58()}`
      )
      return response.data
    } catch (err) {
      console.error('Failed to fetch positions:', err)
      return []
    }
  }, [publicKey])

  /**
   * Get available markets
   */
  const getMarkets = useCallback(async (): Promise<string[]> => {
    try {
      const response = await api.get<{ markets: string[] }>('/api/transactions/markets')
      return response.data.markets
    } catch (err) {
      console.error('Failed to fetch markets:', err)
      return []
    }
  }, [])

  /**
   * Execute a trading rule (when condition is met)
   */
  const executeRule = useCallback(async (ruleId: number): Promise<TransactionResult> => {
    if (!publicKey || !signTransaction || !connected) {
      return {
        success: false,
        error: 'Wallet not connected',
      }
    }

    setLoading(true)
    setError(null)

    try {
      // 1. Get transaction for rule execution
      const response = await api.post<{
        rule_id: number
        rule_description: string
        transaction: BuildOrderResponse
      }>('/api/transactions/execute-rule', {
        rule_id: ruleId,
        user_pubkey: publicKey.toBase58(),
      })

      if (!response.data.transaction.success || !response.data.transaction.transaction) {
        throw new Error('Failed to build rule execution transaction')
      }

      // 2. Decode and sign
      const txBuffer = Buffer.from(response.data.transaction.transaction, 'base64')
      const transaction = Transaction.from(txBuffer)
      const signedTx = await signTransaction(transaction)

      // 3. Submit
      const signedTxBase64 = Buffer.from(signedTx.serialize()).toString('base64')
      const submitResponse = await api.post<{
        success: boolean
        signature?: string
        explorer_url?: string
        error?: string
      }>('/api/transactions/submit', {
        signed_transaction: signedTxBase64,
        user_pubkey: publicKey.toBase58(),
      })

      if (!submitResponse.data.success) {
        throw new Error(submitResponse.data.error || 'Failed to submit')
      }

      return {
        success: true,
        signature: submitResponse.data.signature,
        explorerUrl: submitResponse.data.explorer_url,
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Execution failed'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }, [publicKey, signTransaction, connected])

  return {
    placeOrder,
    getPositions,
    getMarkets,
    executeRule,
    loading,
    error,
    lastTransaction,
    isWalletConnected: connected && !!publicKey,
    walletAddress: publicKey?.toBase58(),
  }
}
