import { useState, useEffect } from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  ExternalLink, 
  AlertCircle,
  CheckCircle,
  Wallet
} from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useDriftTrading } from '../hooks/useDriftTrading'

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

    const result = await placeOrder({
      market,
      side,
      size: parseFloat(size),
      price: orderType === 'limit' && price ? parseFloat(price) : undefined,
      orderType,
    })

    if (result.success) {
      setShowSuccess(true)
      setSize('')
      setPrice('')
      setTimeout(() => setShowSuccess(false), 5000)
      loadPositions()
    }
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

      {/* Positions */}
      {positions.length > 0 && (
        <div className="border-t border-dark-700/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-white">Open Positions</h4>
            <button
              onClick={loadPositions}
              className="text-dark-400 hover:text-white transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            {positions.map((pos, i) => (
              <div
                key={i}
                className="bg-dark-900 rounded-lg p-3 flex items-center justify-between"
              >
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
            ))}
          </div>
        </div>
      )}

      {/* Info Footer */}
      <div className="border-t border-dark-700/50 p-4 bg-dark-900/50">
        <p className="text-xs text-dark-400">
          Trading on Drift Protocol Devnet. Transactions are signed with your browser wallet
          and verified on-chain.{' '}
          <a
            href={`https://explorer.solana.com/address/${publicKey?.toBase58()}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 hover:text-primary-300"
          >
            View wallet on explorer →
          </a>
        </p>
      </div>
    </div>
  )
}
