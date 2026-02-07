import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { ExternalLink, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { rulesApi, Trade, TradingRule } from '../services/api'
import { TableSkeleton } from '../components/Skeleton'

export default function TradeHistory() {
  const { data: rules, isLoading: rulesLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: () => rulesApi.list(),
  })

  // Gather all trades from all rules
  const allTradesQuery = useQuery({
    queryKey: ['allTrades', rules?.map(r => r.id)],
    queryFn: async () => {
      if (!rules) return []
      const tradesPromises = rules
        .filter(r => r.status === 'triggered')
        .map(async rule => {
          const trades = await rulesApi.getTrades(rule.id)
          return trades.map(t => ({ ...t, rule }))
        })
      const results = await Promise.all(tradesPromises)
      return results.flat().sort((a, b) =>
        new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()
      )
    },
    enabled: !!rules && rules.length > 0,
  })

  const trades = allTradesQuery.data || []
  const isLoading = rulesLoading || allTradesQuery.isLoading

  return (
    <div className="animate-in">
      <h1 className="text-3xl font-bold mb-2 text-white">Trade History</h1>
      <p className="text-dark-400 mb-8">View all executed trades from your trading rules</p>

      {isLoading ? (
        <div className="card rounded-2xl p-6">
          <TableSkeleton rows={5} cols={6} />
        </div>
      ) : trades.length === 0 ? (
        <div className="card rounded-2xl p-12 text-center">
          <p className="text-dark-400 mb-2">No trades executed yet</p>
          <p className="text-sm text-dark-500">
            When your trading rules trigger, executed trades will appear here.
          </p>
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
                {trades.map((trade: Trade & { rule: TradingRule }) => (
                  <tr key={trade.id}>
                    <td>
                      <div>
                        <p className="text-sm text-white">{format(new Date(trade.executed_at), 'MMM d, yyyy')}</p>
                        <p className="text-xs text-dark-500">{format(new Date(trade.executed_at), 'HH:mm:ss')}</p>
                      </div>
                    </td>
                    <td>
                      <span className="font-medium text-white">{trade.market}</span>
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                        trade.side === 'long'
                          ? 'bg-success-500/20 text-success-400 border border-success-500/30'
                          : 'bg-danger-500/20 text-danger-400 border border-danger-500/30'
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
                      <Link
                        to={`/rules/${trade.rule_id}`}
                        className="text-primary-400 hover:text-primary-300 text-sm truncate max-w-[200px] block transition-colors"
                      >
                        {trade.rule?.parsed_summary || `Rule #${trade.rule_id}`}
                      </Link>
                    </td>
                    <td>
                      {trade.tx_signature ? (
                        <a
                          href={`https://solscan.io/tx/${trade.tx_signature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 text-sm transition-colors"
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-dark-500 text-sm">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
