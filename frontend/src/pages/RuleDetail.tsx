import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import { ArrowLeft, CheckCircle, XCircle, Clock, ExternalLink, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { rulesApi } from '../services/api'
import { DetailPageSkeleton } from '../components/Skeleton'

export default function RuleDetail() {
  const { id } = useParams<{ id: string }>()
  const ruleId = parseInt(id!, 10)

  const { data: rule, isLoading: ruleLoading } = useQuery({
    queryKey: ['rule', ruleId],
    queryFn: () => rulesApi.get(ruleId),
  })

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['ruleLogs', ruleId],
    queryFn: () => rulesApi.getLogs(ruleId),
    refetchInterval: 5000,
  })

  const { data: trades } = useQuery({
    queryKey: ['ruleTrades', ruleId],
    queryFn: () => rulesApi.getTrades(ruleId),
  })

  if (ruleLoading) {
    return <DetailPageSkeleton />
  }

  if (!rule) {
    return (
      <div className="text-center py-12">
        <XCircle className="h-12 w-12 text-danger-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-danger-400 mb-2">Rule not found</h2>
        <Link to="/" className="text-primary-400 hover:text-primary-300">
          Return to Dashboard
        </Link>
      </div>
    )
  }

  const statusConfig = {
    active: { bg: 'bg-success-500/20', text: 'text-success-400', border: 'border-success-500/30' },
    paused: { bg: 'bg-warning-500/20', text: 'text-warning-400', border: 'border-warning-500/30' },
    triggered: { bg: 'bg-info-500/20', text: 'text-info-400', border: 'border-info-500/30' },
    expired: { bg: 'bg-dark-600/30', text: 'text-dark-400', border: 'border-dark-600/50' },
  }

  const config = statusConfig[rule.status]

  return (
    <div className="space-y-6 animate-in">
      {/* Back Link */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      {/* Rule Summary */}
      <div className="card bg-gradient-to-br from-dark-800 to-dark-800/50 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
          <div className="flex-1">
            <h1 className="text-2xl font-bold mb-2 text-white">
              {rule.parsed_summary || 'Trading Rule'}
            </h1>
            <p className="text-dark-400">{rule.user_input}</p>
          </div>
          <span className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full ${config.bg} ${config.text} border ${config.border}`}>
            {rule.status === 'active' && <Activity className="h-4 w-4" />}
            {rule.status.charAt(0).toUpperCase() + rule.status.slice(1)}
          </span>
        </div>

        {/* Rule Details Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-dark-900/50 rounded-xl p-4 border border-dark-700/50">
            <span className="text-xs text-dark-500 uppercase tracking-wide font-medium">Market</span>
            <p className="font-semibold text-lg mt-1 text-white">{rule.market}</p>
          </div>
          <div className="bg-dark-900/50 rounded-xl p-4 border border-dark-700/50">
            <span className="text-xs text-dark-500 uppercase tracking-wide font-medium">Condition</span>
            <p className="font-semibold text-lg mt-1 text-white">
              {rule.condition_type.replace(/_/g, ' ')}
            </p>
            <p className="text-sm text-dark-400">${rule.condition_value}</p>
          </div>
          <div className="bg-dark-900/50 rounded-xl p-4 border border-dark-700/50">
            <span className="text-xs text-dark-500 uppercase tracking-wide font-medium">Action</span>
            <p className="font-semibold text-lg mt-1 capitalize text-white">{rule.action_type}</p>
            <p className="text-sm text-dark-400">{rule.action_amount_percent}%</p>
          </div>
          <div className="bg-dark-900/50 rounded-xl p-4 border border-dark-700/50">
            <span className="text-xs text-dark-500 uppercase tracking-wide font-medium">Reference Price</span>
            <p className="font-semibold text-lg mt-1 text-white">
              {rule.reference_price ? `$${rule.reference_price.toFixed(2)}` : 'N/A'}
            </p>
          </div>
        </div>

        {/* Timestamps */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-dark-700/50 text-sm text-dark-400">
          <span>Created {formatDistanceToNow(new Date(rule.created_at), { addSuffix: true })}</span>
          {rule.triggered_at && (
            <span className="text-info-400">
              Triggered {formatDistanceToNow(new Date(rule.triggered_at), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      {/* Trades */}
      {trades && trades.length > 0 && (
        <div className="card rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-dark-700/50">
            <h2 className="text-xl font-semibold flex items-center gap-2 text-white">
              <CheckCircle className="h-5 w-5 text-success-400" />
              Executed Trades
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Side</th>
                  <th>Size</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.id}>
                    <td>
                      <div>
                        <p className="text-white">{format(new Date(trade.executed_at), 'MMM d, yyyy')}</p>
                        <p className="text-xs text-dark-500">{format(new Date(trade.executed_at), 'HH:mm:ss')}</p>
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                        trade.side === 'long'
                          ? 'bg-success-500/20 text-success-400 border border-success-500/30'
                          : 'bg-danger-500/20 text-danger-400 border border-danger-500/30'
                      }`}>
                        {trade.side === 'long' ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {trade.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="font-mono text-white">{trade.size}</td>
                    <td className="font-mono text-white">${trade.price.toFixed(2)}</td>
                    <td>
                      <span className="text-success-400 text-xs font-medium">{trade.status || 'completed'}</span>
                    </td>
                    <td>
                      {trade.tx_signature ? (
                        <a
                          href={`https://solscan.io/tx/${trade.tx_signature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 transition-colors"
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-dark-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Execution Logs */}
      <div className="card rounded-2xl">
        <div className="p-6 border-b border-dark-700/50">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-white">
            <Clock className="h-5 w-5 text-dark-400" />
            Execution Logs
          </h2>
        </div>
        <div className="p-6">
          {logsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse flex gap-4">
                  <div className="h-4 w-4 bg-dark-700 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-dark-700 rounded w-3/4"></div>
                    <div className="h-3 bg-dark-700 rounded w-1/4"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : logs && logs.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-3 p-4 rounded-xl transition-colors ${
                    log.error
                      ? 'bg-danger-500/10 border border-danger-500/20'
                      : log.condition_met
                      ? 'bg-success-500/10 border border-success-500/20'
                      : 'bg-dark-700/30 border border-dark-700'
                  }`}
                >
                  <div className="mt-0.5">
                    {log.error ? (
                      <XCircle className="h-5 w-5 text-danger-400" />
                    ) : log.condition_met ? (
                      <CheckCircle className="h-5 w-5 text-success-400" />
                    ) : (
                      <Clock className="h-5 w-5 text-dark-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${log.error ? 'text-danger-400' : 'text-dark-200'}`}>
                      {log.error || log.message || 'Checked conditions'}
                    </p>
                    {log.current_price && (
                      <p className="text-xs text-dark-500 mt-1">
                        Price: <span className="font-mono">${log.current_price.toFixed(2)}</span>
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-dark-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.checked_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-dark-400">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No logs yet</p>
              <p className="text-sm text-dark-500 mt-1">Logs will appear here when the rule is checked</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
