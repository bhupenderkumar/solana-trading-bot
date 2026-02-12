import { useState } from 'react'
import { usePendingTrades } from '../hooks/usePendingTrades'

export default function PendingTradesNotification() {
  const { pendingTrades, pendingCount, loading, approveTrade, rejectTrade } = usePendingTrades()
  const [expanded, setExpanded] = useState(false)
  const [processingId, setProcessingId] = useState<number | null>(null)

  if (pendingCount === 0) return null

  const handleApprove = async (trade: typeof pendingTrades[0]) => {
    setProcessingId(trade.id)
    const result = await approveTrade(trade)
    if (!result.success) {
      alert(result.error || 'Failed to execute trade')
    }
    setProcessingId(null)
  }

  const handleReject = async (tradeId: number) => {
    setProcessingId(tradeId)
    await rejectTrade(tradeId)
    setProcessingId(null)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Notification Bell */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="relative bg-yellow-500 hover:bg-yellow-600 text-black rounded-full p-3 shadow-lg transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
          {pendingCount}
        </span>
      </button>

      {/* Expanded Panel */}
      {expanded && (
        <div className="absolute bottom-16 right-0 w-96 max-h-96 overflow-y-auto bg-gray-800 rounded-lg shadow-xl border border-gray-700">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-white font-semibold">Pending Trades</h3>
            <p className="text-gray-400 text-sm">Trades waiting for your approval</p>
          </div>

          <div className="divide-y divide-gray-700">
            {pendingTrades.map((trade) => (
              <div key={trade.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-yellow-400 font-medium">{trade.title}</span>
                    <p className="text-gray-300 text-sm mt-1">{trade.message}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                  <span className={trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                    {trade.side.toUpperCase()}
                  </span>
                  <span>{trade.size.toFixed(4)} {trade.market.replace('-PERP', '')}</span>
                  <span>@ ${trade.price_at_trigger.toFixed(2)}</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(trade)}
                    disabled={loading || processingId === trade.id}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm py-2 px-3 rounded transition-colors"
                  >
                    {processingId === trade.id ? 'Signing...' : 'Approve & Sign'}
                  </button>
                  <button
                    onClick={() => handleReject(trade.id)}
                    disabled={loading || processingId === trade.id}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 text-white text-sm py-2 px-3 rounded transition-colors"
                  >
                    Reject
                  </button>
                </div>

                {trade.expires_at && (
                  <p className="text-gray-500 text-xs mt-2">
                    Expires: {new Date(trade.expires_at).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
