import { useState, useEffect } from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  ExternalLink, 
  AlertCircle,
  CheckCircle,
  Wallet,
  Clock,
  XCircle,
  History,
  Copy,
  CheckCheck
} from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useDriftTrading } from '../hooks/useDriftTrading'

// Order status types
type OrderStatus = 'pending' | 'executed' | 'failed'

interface OrderHistory {
  id: string
  market: string
  side: 'buy' | 'sell'
  size: number
  orderType: 'market' | 'limit'
  price?: number
  status: OrderStatus
  signature?: string
  explorerUrl?: string
  error?: string
  timestamp: Date
}

const MARKETS = [
  'SOL-PERP',
  'BTC-PERP',
  'ETH-PERP',
  'DOGE-PERP',
  'JUP-PERP',
  'WIF-PERP',
]

export default function TradingPanel() {
  const { connected, publicKey } = useWallet()
  const { setVisible } = useWalletModal()
  const { 
    placeOrder, 
    getPositions, 
    loading, 
    error, 
    lastTransaction,
    isWalletConnected 
  } = useDriftTrading()

  const [market, setMarket] = useState('SOL-PERP')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [size, setSize] = useState('')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [price, setPrice] = useState('')
  const [positions, setPositions] = useState<any[]>([])
  const [showSuccess, setShowSuccess] = useState(false)
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Load positions on connect
  useEffect(() => {
    if (connected && publicKey) {
      loadPositions()
    }
  }, [connected, publicKey])

  const loadPositions = async () => {
    const pos = await getPositions()
    setPositions(pos)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!size || parseFloat(size) <= 0) {
      return
    }

    const orderSize = parseFloat(size)
    const orderPrice = orderType === 'limit' && price ? parseFloat(price) : undefined
    
    // Create pending order
    const pendingOrder: OrderHistory = {
      id: `order_${Date.now()}`,
      market,
      side,
      size: orderSize,
      orderType,
      price: orderPrice,
      status: 'pending',
      timestamp: new Date(),
    }
    
    setOrderHistory(prev => [pendingOrder, ...prev].slice(0, 20)) // Keep last 20 orders

    const result = await placeOrder({
      market,
      side,
      size: orderSize,
      price: orderPrice,
      orderType,
    })

    // Update order status
    setOrderHistory(prev => prev.map(order => 
      order.id === pendingOrder.id 
        ? {
            ...order,
            status: result.success ? 'executed' : 'failed',
            signature: result.signature,
            explorerUrl: result.explorerUrl,
            error: result.error,
          }
        : order
    ))

    if (result.success) {
      setShowSuccess(true)
      setSize('')
      setPrice('')
      setTimeout(() => setShowSuccess(false), 5000)
      loadPositions()
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
            <Clock className="h-3 w-3 animate-pulse" />
            Pending
          </span>
        )
      case 'executed':
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-success-500/20 text-success-400">
            <CheckCircle className="h-3 w-3" />
            Executed
          </span>
        )
      case 'failed':
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        )
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const shortenSignature = (sig: string) => {
    if (sig.length <= 16) return sig
    return `${sig.slice(0, 8)}...${sig.slice(-8)}`
  }

  if (!connected) {
    return (
      <div className="bg-dark-800 rounded-xl p-6 border border-dark-700/50">
        <div className="text-center py-8">
          <Wallet className="h-12 w-12 text-dark-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Connect Wallet to Trade</h3>
          <p className="text-dark-400 mb-4">
            Connect your Phantom or Solflare wallet to start trading on Drift Protocol (Devnet)
          </p>
          <button
            onClick={() => setVisible(true)}
            className="btn-primary"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-dark-700/50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Trade on Drift</h3>
          <span className="text-xs bg-success-500/20 text-success-400 px-2 py-1 rounded-full">
            Devnet
          </span>
        </div>
      </div>

      {/* Success Message */}
      {showSuccess && lastTransaction?.success && (
        <div className="m-4 p-3 bg-success-500/10 border border-success-500/30 rounded-lg flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-success-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-success-400 text-sm font-medium">Transaction Submitted!</p>
            {lastTransaction.explorerUrl && (
              <a
                href={lastTransaction.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-success-400/70 hover:text-success-400 flex items-center gap-1"
              >
                View on Explorer <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="m-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Order Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Market Select */}
        <div>
          <label className="block text-sm text-dark-400 mb-1">Market</label>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-white focus:border-primary-500 focus:outline-none"
          >
            {MARKETS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Buy/Sell Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSide('buy')}
            className={`py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              side === 'buy'
                ? 'bg-success-500 text-white'
                : 'bg-dark-700 text-dark-400 hover:text-white'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Long
          </button>
          <button
            type="button"
            onClick={() => setSide('sell')}
            className={`py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              side === 'sell'
                ? 'bg-red-500 text-white'
                : 'bg-dark-700 text-dark-400 hover:text-white'
            }`}
          >
            <TrendingDown className="h-4 w-4" />
            Short
          </button>
        </div>

        {/* Order Type */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setOrderType('market')}
            className={`py-2 rounded-lg text-sm font-medium transition-colors ${
              orderType === 'market'
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/50'
                : 'bg-dark-700 text-dark-400'
            }`}
          >
            Market
          </button>
          <button
            type="button"
            onClick={() => setOrderType('limit')}
            className={`py-2 rounded-lg text-sm font-medium transition-colors ${
              orderType === 'limit'
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/50'
                : 'bg-dark-700 text-dark-400'
            }`}
          >
            Limit
          </button>
        </div>

        {/* Size Input */}
        <div>
          <label className="block text-sm text-dark-400 mb-1">Size</label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="0.00"
            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder-dark-500 focus:border-primary-500 focus:outline-none"
          />
        </div>

        {/* Limit Price Input */}
        {orderType === 'limit' && (
          <div>
            <label className="block text-sm text-dark-400 mb-1">Limit Price ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder-dark-500 focus:border-primary-500 focus:outline-none"
            />
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !size || parseFloat(size) <= 0}
          className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
            side === 'buy'
              ? 'bg-success-500 hover:bg-success-400 disabled:bg-success-500/50'
              : 'bg-red-500 hover:bg-red-400 disabled:bg-red-500/50'
          } text-white disabled:cursor-not-allowed`}
        >
          {loading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Signing...
            </>
          ) : (
            <>
              {side === 'buy' ? 'Buy' : 'Sell'} {market.replace('-PERP', '')}
            </>
          )}
        </button>
      </form>

      {/* Order History */}
      {orderHistory.length > 0 && (
        <div className="border-t border-dark-700/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-white flex items-center gap-2">
              <History className="h-4 w-4 text-primary-400" />
              Recent Orders
            </h4>
            <button
              onClick={() => setOrderHistory([])}
              className="text-xs text-dark-400 hover:text-white transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {orderHistory.map((order) => (
              <div
                key={order.id}
                className="bg-dark-900 rounded-lg p-3 space-y-2"
              >
                {/* Order Info Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      order.side === 'buy' ? 'bg-success-500/20 text-success-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {order.side === 'buy' ? 'LONG' : 'SHORT'}
                    </span>
                    <span className="text-white font-medium text-sm">{order.market}</span>
                    <span className="text-dark-400 text-xs">
                      {order.size.toFixed(4)} @ {order.orderType === 'market' ? 'Market' : `$${order.price?.toFixed(2)}`}
                    </span>
                  </div>
                  {getStatusBadge(order.status)}
                </div>

                {/* Transaction Details Row */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dark-500">{formatTime(order.timestamp)}</span>
                  
                  {order.signature && (
                    <div className="flex items-center gap-2">
                      {/* Signature with copy */}
                      <button
                        onClick={() => copyToClipboard(order.signature!, order.id)}
                        className="flex items-center gap-1 text-dark-400 hover:text-white transition-colors font-mono"
                        title="Copy transaction signature"
                      >
                        {shortenSignature(order.signature)}
                        {copiedId === order.id ? (
                          <CheckCheck className="h-3 w-3 text-success-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>

                      {/* Explorer Link */}
                      {order.explorerUrl && (
                        <a
                          href={order.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary-400 hover:text-primary-300 transition-colors"
                          title="Verify on Solana Explorer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Verify
                        </a>
                      )}
                    </div>
                  )}

                  {order.error && (
                    <span className="text-red-400 truncate max-w-[200px]" title={order.error}>
                      {order.error}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Positions */}
      {positions.length > 0 && (
        <div className="border-t border-dark-700/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-white">Open Positions</h4>
            <div className="flex items-center gap-2">
              <a
                href={`https://app.drift.trade/?network=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                title="Verify positions on Drift"
              >
                <ExternalLink className="h-3 w-3" />
                Drift App
              </a>
              <button
                onClick={loadPositions}
                className="text-dark-400 hover:text-white transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {positions.map((pos, i) => (
              <div
                key={i}
                className="bg-dark-900 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white font-medium">{pos.market}</span>
                    <span className={`ml-2 text-xs ${
                      pos.side === 'long' ? 'text-success-400' : 'text-red-400'
                    }`}>
                      {pos.side.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-white">{pos.size.toFixed(4)}</div>
                    <div className={`text-xs ${
                      pos.unrealized_pnl >= 0 ? 'text-success-400' : 'text-red-400'
                    }`}>
                      {pos.unrealized_pnl >= 0 ? '+' : ''}{pos.unrealized_pnl.toFixed(2)} USDC
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dark-500">Entry: ${pos.entry_price?.toFixed(2) || 'N/A'}</span>
                  <a
                    href={`https://app.drift.trade/overview?userAccount=${publicKey?.toBase58()}&network=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-400 hover:text-primary-300 flex items-center gap-1"
                  >
                    Verify on Drift <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification Links */}
      <div className="border-t border-dark-700/50 p-4">
        <h4 className="text-sm font-medium text-white mb-3">Verify Your Trading Activity</h4>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`https://app.drift.trade/overview?userAccount=${publicKey?.toBase58()}&network=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 p-3 bg-dark-900 hover:bg-dark-700 rounded-lg border border-dark-700 transition-colors group"
          >
            <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-blue-500 rounded flex items-center justify-center text-white text-xs font-bold">D</div>
            <div className="text-left">
              <div className="text-xs font-medium text-white group-hover:text-primary-400">Drift Protocol</div>
              <div className="text-[10px] text-dark-400">View positions & orders</div>
            </div>
            <ExternalLink className="h-3 w-3 text-dark-400 group-hover:text-primary-400" />
          </a>
          <a
            href={`https://explorer.solana.com/address/${publicKey?.toBase58()}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 p-3 bg-dark-900 hover:bg-dark-700 rounded-lg border border-dark-700 transition-colors group"
          >
            <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-teal-500 rounded flex items-center justify-center text-white text-xs font-bold">S</div>
            <div className="text-left">
              <div className="text-xs font-medium text-white group-hover:text-primary-400">Solana Explorer</div>
              <div className="text-[10px] text-dark-400">View all transactions</div>
            </div>
            <ExternalLink className="h-3 w-3 text-dark-400 group-hover:text-primary-400" />
          </a>
        </div>
        <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-xs text-amber-400">
            <strong>Devnet Mode:</strong> Connect your wallet to <a href="https://app.drift.trade/?network=devnet" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-300">app.drift.trade</a> with the same wallet to see your positions, open orders, and trading history.
          </p>
        </div>
      </div>

      {/* Info Footer */}
      <div className="border-t border-dark-700/50 p-4 bg-dark-900/50">
        <p className="text-xs text-dark-400">
          Trading on Drift Protocol Devnet. All positions and orders are verifiable on-chain.
        </p>
      </div>
    </div>
  )
}
