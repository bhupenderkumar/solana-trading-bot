import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { ExternalLink, ArrowUpRight, ArrowDownRight, History } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { tradesApi, rulesApi, Trade } from '../services/api'
import { TableSkeleton } from '../components/Skeleton'

export default function TradeHistory() {
  // Get connected wallet address
  const { publicKey } = useWallet()
  const walletAddress = publicKey?.toBase58()
  
  // Fetch all trades directly from the centralized endpoint, filtered by wallet
  const { data: trades, isLoading } = useQuery({
    queryKey: ['trades', walletAddress],
    queryFn: () => tradesApi.list(100, walletAddress),
    refetchInterval: 30000,
  })

  // Fetch rules to get their summaries for display, filtered by wallet
  const { data: rules } = useQuery({
    queryKey: ['rules', walletAddress],
    queryFn: () => rulesApi.list(undefined, walletAddress),
  })

  // Create a map of rule_id to rule for quick lookup
  const rulesMap = new Map(rules?.map(r => [r.id, r]) || [])

  return (
    <div className="animate-in">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-indigo-500/15 rounded-lg border border-indigo-500/20">
          <History className="h-5 w-5 text-indigo-400" />
        </div>
        <h1 className="text-3xl font-bold text-white">Trade History</h1>
      </div>
      <p className="text-gray-400 mb-8">View all executed trades from your trading rules</p>

      {isLoading ? (
        <div className="card rounded-2xl p-6">
          <TableSkeleton rows={5} cols={6} />
        </div>
      ) : !trades || trades.length === 0 ? (
        <div className="card rounded-2xl p-12 text-center">
          <History className="h-12 w-12 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 mb-2">No trades executed yet</p>
          <p className="text-sm text-gray-500">
            When your trading rules trigger, executed trades will appear here.
          </p>
          <Link to="/chat" className="btn-primary mt-4 inline-flex items-center gap-2 text-sm">
            Create a Trading Rule
          </Link>
        </div>
      ) : (
        <div className="card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Market</th>
                  <th>Side</th>
                  <th>Size</th>
                  <th>Price</th>
                  <th>Rule</th>
                  <th>TX</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade: Trade) => {
                  const rule = trade.rule_id ? rulesMap.get(trade.rule_id) : null
                  return (
                    <tr key={trade.id}>
                      <td>
                        <div>
                          <p className="text-sm text-white">{format(new Date(trade.executed_at), 'MMM d, yyyy')}</p>
                          <p className="text-xs text-gray-500">{format(new Date(trade.executed_at), 'HH:mm:ss')}</p>
                        </div>
                      </td>
                      <td>
                        <span className="font-medium text-white">{trade.market}</span>
                      </td>
                      <td>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                          trade.side === 'long'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {trade.side === 'long' ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {trade.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="font-mono text-white">
                        {trade.size}
                      </td>
                      <td className="font-mono text-white">
                        ${trade.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        {trade.rule_id ? (
                          <Link
                            to={`/rules/${trade.rule_id}`}
                            className="text-indigo-400 hover:text-indigo-300 text-sm truncate max-w-[200px] block transition-colors"
                          >
                            {rule?.parsed_summary || `Rule #${trade.rule_id}`}
                          </Link>
                        ) : (
                          <span className="text-gray-500 text-sm">Manual</span>
                        )}
                      </td>
                      <td>
                        {trade.tx_signature ? (
                          <a
                            href={`https://solscan.io/tx/${trade.tx_signature}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
                          >
                            View
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-gray-500 text-sm">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
