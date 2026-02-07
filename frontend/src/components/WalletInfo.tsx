import { useState, useCallback, useEffect } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  Wallet,
  RefreshCw,
  ExternalLink,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
  History,
  Copy,
  Check,
  Droplets,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  WifiOff,
  Wifi,
  Zap,
} from 'lucide-react'
import { useToast } from './Toast'
import { useConnectionStatus, useWalletError } from '../contexts/SolanaWalletProvider'

interface TransactionInfo {
  signature: string
  blockTime: number | null
  err: any | null
  type: 'send' | 'receive' | 'unknown'
  amount?: number
}

export default function WalletInfo() {
  const { connection } = useConnection()
  const { publicKey, connected, wallet, connecting, disconnecting } = useWallet()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { isConnected: rpcConnected, latency, error: rpcError } = useConnectionStatus()
  const { lastError: walletError, clearError: clearWalletError } = useWalletError()

  const [showHistory, setShowHistory] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isAirdropping, setIsAirdropping] = useState(false)

  const walletAddress = publicKey?.toBase58()

  // Debug wallet state
  useEffect(() => {
    console.log('WalletInfo State:', {
      connected,
      connecting,
      disconnecting,
      publicKey: publicKey?.toBase58(),
      walletName: wallet?.adapter.name,
      rpcConnected,
      latency,
    })
  }, [connected, connecting, disconnecting, publicKey, wallet, rpcConnected, latency])

  // Fetch wallet balance
  const { data: balance, isLoading: balanceLoading, error: balanceError, refetch: refetchBalance } = useQuery({
    queryKey: ['walletBalance', walletAddress],
    queryFn: async () => {
      if (!publicKey) return null
      console.log('Fetching balance for:', publicKey.toBase58())
      try {
        const lamports = await connection.getBalance(publicKey)
        console.log('Balance fetched:', lamports, 'lamports')
        return {
          lamports,
          sol: lamports / LAMPORTS_PER_SOL,
        }
      } catch (err) {
        console.error('Failed to fetch balance:', err)
        throw err
      }
    },
    enabled: !!publicKey && connected && rpcConnected,
    refetchInterval: 30000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

  // Fetch transaction history
  const { data: transactions, isLoading: txLoading, error: txError } = useQuery({
    queryKey: ['walletTransactions', walletAddress],
    queryFn: async () => {
      if (!publicKey) return []
      console.log('Fetching transactions for:', publicKey.toBase58())
      
      try {
        const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 10 })
        console.log('Fetched', signatures.length, 'transactions')

        const txDetails: TransactionInfo[] = await Promise.all(
          signatures.map(async (sig) => {
            try {
              const tx = await connection.getParsedTransaction(sig.signature, {
                maxSupportedTransactionVersion: 0,
              })

              let type: 'send' | 'receive' | 'unknown' = 'unknown'
              let amount: number | undefined

              if (tx?.meta) {
                const preBalance = tx.meta.preBalances[0]
                const postBalance = tx.meta.postBalances[0]
                const balanceChange = (postBalance - preBalance) / LAMPORTS_PER_SOL

                if (Math.abs(balanceChange) > 0.000001) {
                  type = balanceChange > 0 ? 'receive' : 'send'
                  amount = Math.abs(balanceChange)
                }
              }

              return {
                signature: sig.signature,
                blockTime: sig.blockTime ?? null,
                err: sig.err,
                type,
                amount,
              }
            } catch {
              return {
                signature: sig.signature,
                blockTime: sig.blockTime ?? null,
                err: sig.err,
                type: 'unknown' as const,
              }
            }
          })
        )

        return txDetails
      } catch (err) {
        console.error('Failed to fetch transactions:', err)
        throw err
      }
    },
    enabled: !!publicKey && connected && showHistory && rpcConnected,
    retry: 2,
  })

  // Request airdrop
  const handleAirdrop = useCallback(async () => {
    if (!publicKey) return

    setIsAirdropping(true)
    try {
      console.log('Requesting airdrop for:', publicKey.toBase58())
      const signature = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL)
      console.log('Airdrop signature:', signature)
      
      await connection.confirmTransaction(signature, 'confirmed')
      toast.success('Airdrop successful!', '1 SOL has been added to your wallet')

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['walletBalance'] })
        queryClient.invalidateQueries({ queryKey: ['walletTransactions'] })
      }, 2000)
    } catch (error) {
      console.error('Airdrop failed:', error)
      toast.error('Airdrop failed', (error as Error).message)
    } finally {
      setIsAirdropping(false)
    }
  }, [publicKey, connection, toast, queryClient])

  const copyAddress = useCallback(() => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [walletAddress])

  // Connection Status Banner
  const ConnectionStatus = () => {
    return (
      <>
        {/* Wallet Error Banner */}
        {walletError && (
          <div className="mb-4 p-3 bg-warning-500/10 border border-warning-500/30 rounded-xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-warning-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning-400">Wallet Connection Issue</p>
              <p className="text-xs text-dark-400">{walletError.userMessage}</p>
            </div>
            <button
              onClick={clearWalletError}
              className="text-dark-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-dark-700 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
        
        {/* RPC Connection Status */}
        {!rpcConnected && rpcError && (
          <div className="mb-4 p-3 bg-danger-500/10 border border-danger-500/30 rounded-xl flex items-center gap-3">
            <WifiOff className="h-5 w-5 text-danger-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-danger-400">RPC Connection Failed</p>
              <p className="text-xs text-dark-400">{rpcError}</p>
            </div>
          </div>
        )}
        
        {rpcConnected && latency !== null && !walletError && (
          <div className="mb-4 p-3 bg-success-500/10 border border-success-500/30 rounded-xl flex items-center gap-3">
            <Wifi className="h-4 w-4 text-success-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-success-400">Connected to Solana Devnet</p>
              <p className="text-xs text-dark-400">Latency: {latency}ms</p>
            </div>
          </div>
        )}
      </>
    )
  }

  // Show connect wallet button when not connected
  if (!connected) {
    return (
      <div className="card rounded-2xl overflow-hidden">
        <div className="p-6 bg-gradient-to-br from-primary-600/10 via-dark-800 to-dark-800 text-center">
          <ConnectionStatus />
          
          <div className="p-3 bg-primary-500/20 rounded-xl w-fit mx-auto mb-4">
            <Wallet className="h-8 w-8 text-primary-400" />
          </div>
          <h3 className="font-semibold text-white text-lg mb-2">Connect Your Wallet</h3>
          <p className="text-dark-400 text-sm mb-6 max-w-sm mx-auto">
            Connect your Solana wallet to view your balance, transaction history, and interact with the trading bot.
          </p>
          
          {/* Connecting state */}
          {connecting && (
            <div className="mb-4 p-3 bg-info-500/10 border border-info-500/30 rounded-xl flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 text-info-400 animate-spin" />
              <span className="text-sm text-info-400">Connecting to wallet...</span>
            </div>
          )}
          
          {/* Official Wallet Multi Button - handles all connection logic */}
          <div className="flex justify-center wallet-adapter-button-wrapper">
            <WalletMultiButton />
          </div>

          <div className="mt-6 p-4 bg-dark-700/30 rounded-xl text-left">
            <p className="text-dark-400 text-xs mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning-400" />
              <span>Need a wallet? Install one of these browser extensions:</span>
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <a
                href="https://phantom.app/download"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-white transition-colors"
              >
                Phantom
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://solflare.com/download"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-white transition-colors"
              >
                Solflare
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://www.backpack.app/download"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-white transition-colors"
              >
                Backpack
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="text-dark-500 text-xs mt-3 text-center">
              After installing, refresh this page and click the button above
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card rounded-2xl overflow-hidden">
      {/* Connection Status */}
      <ConnectionStatus />
      
      {/* Header with balance */}
      <div className="p-5 bg-gradient-to-br from-primary-600/20 via-dark-800 to-dark-800">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary-500/20 rounded-xl">
              {wallet?.adapter.icon ? (
                <img src={wallet.adapter.icon} alt={wallet.adapter.name} className="h-5 w-5" />
              ) : (
                <Wallet className="h-5 w-5 text-primary-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white">{wallet?.adapter.name || 'Wallet'}</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success-500/20 text-success-400 text-xs rounded-full">
                  <span className="h-1.5 w-1.5 bg-success-400 rounded-full animate-pulse" />
                  Connected
                </span>
              </div>
              <button
                onClick={copyAddress}
                className="flex items-center gap-1 text-xs text-dark-400 hover:text-white transition-colors mt-0.5"
              >
                <code>{walletAddress?.slice(0, 8)}...{walletAddress?.slice(-6)}</code>
                {copied ? (
                  <Check className="h-3 w-3 text-success-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchBalance()}
              className="p-2 hover:bg-dark-700/50 rounded-lg transition-colors text-dark-400 hover:text-white"
              title="Refresh balance"
            >
              <RefreshCw className={`h-4 w-4 ${balanceLoading ? 'animate-spin' : ''}`} />
            </button>
            <a
              href={`https://explorer.solana.com/address/${walletAddress}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-dark-700/50 rounded-lg transition-colors text-dark-400 hover:text-white"
              title="View on Solana Explorer"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            {/* Use official button for disconnect too */}
            <div className="wallet-adapter-button-wrapper">
              <WalletMultiButton />
            </div>
          </div>
        </div>

        {/* Balance Error */}
        {balanceError && (
          <div className="mb-4 p-3 bg-danger-500/10 border border-danger-500/30 rounded-xl flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-danger-400" />
            <span className="text-sm text-danger-400">Failed to load balance: {(balanceError as Error).message}</span>
          </div>
        )}

        {/* Balance Display */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-dark-400 mb-1 font-medium">Balance</p>
            {balanceLoading ? (
              <div className="h-8 w-32 bg-dark-700 animate-pulse rounded" />
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white font-mono">
                  {balance?.sol.toFixed(4) || '0.0000'}
                </span>
                <span className="text-lg text-dark-400">SOL</span>
              </div>
            )}
            {balance && (
              <p className="text-xs text-dark-500 mt-1">
                {balance.lamports.toLocaleString()} lamports
              </p>
            )}
          </div>

          {/* Airdrop Button */}
          <button
            onClick={handleAirdrop}
            disabled={isAirdropping || !rpcConnected}
            className="flex items-center gap-2 px-4 py-2.5 bg-info-500/20 hover:bg-info-500/30 border border-info-500/30 rounded-xl text-info-400 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={!rpcConnected ? 'RPC not connected' : 'Request 1 SOL airdrop'}
          >
            {isAirdropping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Droplets className="h-4 w-4" />
            )}
            Request Airdrop
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-5 py-3 border-t border-dark-700/50 bg-dark-800/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-dark-400">
            <Zap className="h-3 w-3" />
            <span>Network: Devnet</span>
          </div>
          {latency !== null && (
            <div className="flex items-center gap-2 text-xs text-dark-400">
              <Wifi className="h-3 w-3 text-success-400" />
              <span>{latency}ms</span>
            </div>
          )}
        </div>
      </div>

      {/* Transaction History Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="w-full flex items-center justify-between px-5 py-3 border-t border-dark-700/50 hover:bg-dark-700/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-dark-300">
          <History className="h-4 w-4" />
          <span className="text-sm font-medium">Transaction History</span>
        </div>
        {showHistory ? (
          <ChevronUp className="h-4 w-4 text-dark-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-dark-400" />
        )}
      </button>

      {/* Transaction List */}
      {showHistory && (
        <div className="border-t border-dark-700/50">
          {/* Transaction Error */}
          {txError && (
            <div className="p-4 bg-danger-500/10 border-b border-danger-500/30">
              <p className="text-sm text-danger-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Failed to load transactions: {(txError as Error).message}
              </p>
            </div>
          )}
          
          {txLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-10 w-10 bg-dark-700 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-dark-700 rounded w-3/4" />
                    <div className="h-3 bg-dark-700 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : transactions && transactions.length > 0 ? (
            <div className="divide-y divide-dark-700/50 max-h-80 overflow-y-auto scrollbar-thin">
              {transactions.map((tx) => (
                <TransactionItem key={tx.signature} transaction={tx} />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Coins className="h-8 w-8 text-dark-600 mx-auto mb-2" />
              <p className="text-dark-400 text-sm">No transactions yet</p>
              <p className="text-dark-500 text-xs mt-1">
                Request an airdrop to get started
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface TransactionItemProps {
  transaction: TransactionInfo
}

function TransactionItem({ transaction }: TransactionItemProps) {
  const isReceive = transaction.type === 'receive'
  const isFailed = transaction.err !== null

  return (
    <a
      href={`https://explorer.solana.com/tx/${transaction.signature}?cluster=devnet`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-5 py-3.5 hover:bg-dark-700/30 transition-colors group"
    >
      <div className={`p-2 rounded-lg ${
        isFailed
          ? 'bg-danger-500/20'
          : isReceive
          ? 'bg-success-500/20'
          : 'bg-warning-500/20'
      }`}>
        {isFailed ? (
          <AlertCircle className="h-5 w-5 text-danger-400" />
        ) : isReceive ? (
          <ArrowDownRight className="h-5 w-5 text-success-400" />
        ) : (
          <ArrowUpRight className="h-5 w-5 text-warning-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${
            isFailed ? 'text-danger-400' : 'text-white'
          }`}>
            {isFailed ? 'Failed' : isReceive ? 'Received' : transaction.type === 'send' ? 'Sent' : 'Transaction'}
          </span>
          {transaction.amount && (
            <span className={`text-sm font-mono ${
              isReceive ? 'text-success-400' : 'text-warning-400'
            }`}>
              {isReceive ? '+' : '-'}{transaction.amount.toFixed(4)} SOL
            </span>
          )}
        </div>
        <p className="text-xs text-dark-500 truncate">
          {transaction.signature.slice(0, 16)}...{transaction.signature.slice(-8)}
        </p>
      </div>

      <div className="text-right">
        {transaction.blockTime && (
          <p className="text-xs text-dark-400">
            {formatDistanceToNow(new Date(transaction.blockTime * 1000), { addSuffix: true })}
          </p>
        )}
        <ExternalLink className="h-3 w-3 text-dark-500 opacity-0 group-hover:opacity-100 transition-opacity ml-auto mt-1" />
      </div>
    </a>
  )
}
