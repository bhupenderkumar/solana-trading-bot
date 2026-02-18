import { useState, useCallback, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js'
import api from '../services/api'

const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const SOLANA_NETWORK = import.meta.env.VITE_SOLANA_NETWORK || 'devnet'

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

interface InitializeUserResponse {
  success: boolean
  transaction?: string
  transaction_type: string
  message: string
  details: Record<string, any>
  simulation: Record<string, any>
  requires_signature: boolean
  signer?: string
  error?: string
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTransaction, setLastTransaction] = useState<TransactionResult | null>(null)
  const [needsAccountInitialization, setNeedsAccountInitialization] = useState(false)
  const [checkingAccount, setCheckingAccount] = useState(false)
  const [driftAccountInfo, setDriftAccountInfo] = useState<{
    hasDriftAccount: boolean
    driftAccountPubkey?: string
    network?: string
  } | null>(null)

  /**
   * Check if the connected wallet has a Drift account
   */
  const checkAccount = useCallback(async () => {
    if (!publicKey || !connected) return

    setCheckingAccount(true)
    try {
      const response = await api.get<{
        user_pubkey: string
        has_drift_account: boolean
        drift_account_pubkey: string | null
        network: string
        message: string
      }>(`/transactions/check-account/${publicKey.toBase58()}`)

      const hasAccount = response.data.has_drift_account
      setNeedsAccountInitialization(!hasAccount)
      setDriftAccountInfo({
        hasDriftAccount: hasAccount,
        driftAccountPubkey: response.data.drift_account_pubkey || undefined,
        network: response.data.network,
      })
    } catch (err) {
      console.error('Failed to check Drift account:', err)
      // Don't block the user – assume they might need init
      setNeedsAccountInitialization(true)
    } finally {
      setCheckingAccount(false)
    }
  }, [publicKey, connected])

  // Auto-check when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      checkAccount()
    } else {
      setNeedsAccountInitialization(false)
      setDriftAccountInfo(null)
    }
  }, [connected, publicKey, checkAccount])

  /**
   * Initialize a Drift account for the connected wallet
   */
  const initializeAccount = useCallback(async (): Promise<TransactionResult> => {
    if (!publicKey || !signTransaction || !connected) {
      return {
        success: false,
        error: 'Wallet not connected. Please connect your wallet first.',
      }
    }

    setLoading(true)
    setError(null)

    try {
      // 1. Request unsigned initialize transaction from backend
      const response = await api.post<InitializeUserResponse>('/transactions/initialize-user', {
        user_pubkey: publicKey.toBase58(),
      })

      if (!response.data.success || !response.data.transaction) {
        // Check if account already exists
        if (response.data.error === 'account_exists') {
          setNeedsAccountInitialization(false)
          return {
            success: true,
            error: 'Account already initialized',
          }
        }
        throw new Error(response.data.error || 'Failed to build initialize transaction')
      }

      // 2. Decode the transaction
      const txBuffer = Buffer.from(response.data.transaction, 'base64')
      let transaction: Transaction | VersionedTransaction

      try {
        transaction = VersionedTransaction.deserialize(txBuffer)
      } catch {
        transaction = Transaction.from(txBuffer)
      }

      // 3. Sign with wallet
      console.log('Requesting wallet signature for account initialization...')
      const signedTx = await signTransaction(transaction)

      // 4. Submit directly to Solana RPC (not through backend)
      console.log('Submitting signed transaction to Solana RPC...')
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
      
      let signature: string
      if (signedTx instanceof VersionedTransaction) {
        signature = await connection.sendRawTransaction(signedTx.serialize())
      } else {
        signature = await connection.sendRawTransaction(signedTx.serialize())
      }
      
      // 5. Confirm the transaction
      console.log('Confirming transaction:', signature)
      const confirmation = await connection.confirmTransaction(signature, 'confirmed')
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_NETWORK}`

      setNeedsAccountInitialization(false)
      
      const result: TransactionResult = {
        success: true,
        signature,
        explorerUrl,
      }

      setLastTransaction(result)
      
      // Re-check account status
      await checkAccount()
      
      return result

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Account initialization failed'
      setError(errorMessage)
      console.error('Initialize account error:', err)
      
      return {
        success: false,
        error: errorMessage,
      }

    } finally {
      setLoading(false)
    }
  }, [publicKey, signTransaction, connected, checkAccount])

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
      const response = await api.post<BuildOrderResponse>('/transactions/build-order', {
        user_pubkey: publicKey.toBase58(),
        market: params.market,
        side: params.side,
        size: params.size,
        price: params.price,
        order_type: params.orderType || 'market',
      })

      if (!response.data.success || !response.data.transaction) {
        // Check if user needs to initialize their Drift account
        if (response.data.error === 'drift_account_not_found') {
          setNeedsAccountInitialization(true)
          return {
            success: false,
            error: 'Please initialize your Drift account first. Click "Initialize Account" to continue.',
          }
        }
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

      // 4. Submit directly to Solana RPC
      console.log('Submitting signed transaction to Solana RPC...')
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
      
      let signature: string
      if (signedTx instanceof VersionedTransaction) {
        signature = await connection.sendRawTransaction(signedTx.serialize())
      } else {
        signature = await connection.sendRawTransaction(signedTx.serialize())
      }
      
      // 5. Confirm the transaction
      console.log('Confirming transaction:', signature)
      const confirmation = await connection.confirmTransaction(signature, 'confirmed')
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_NETWORK}`

      const result: TransactionResult = {
        success: true,
        signature,
        explorerUrl,
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
        `/transactions/positions/${publicKey.toBase58()}`
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
      const response = await api.get<{ markets: string[] }>('/transactions/markets')
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
      }>('/transactions/execute-rule', {
        rule_id: ruleId,
        user_pubkey: publicKey.toBase58(),
      })

      if (!response.data.transaction.success || !response.data.transaction.transaction) {
        throw new Error('Failed to build rule execution transaction')
      }

      // 2. Decode and sign
      const txBuffer = Buffer.from(response.data.transaction.transaction, 'base64')
      let transaction: Transaction | VersionedTransaction
      try {
        transaction = VersionedTransaction.deserialize(txBuffer)
      } catch {
        transaction = Transaction.from(txBuffer)
      }
      const signedTx = await signTransaction(transaction)

      // 3. Submit directly to Solana RPC
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
      const signature = await connection.sendRawTransaction(signedTx.serialize())
      
      const confirmation = await connection.confirmTransaction(signature, 'confirmed')
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_NETWORK}`

      return {
        success: true,
        signature,
        explorerUrl,
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
    initializeAccount,
    checkAccount,
    loading,
    error,
    lastTransaction,
    needsAccountInitialization,
    checkingAccount,
    driftAccountInfo,
    isWalletConnected: connected && !!publicKey,
    walletAddress: publicKey?.toBase58(),
  }
}
