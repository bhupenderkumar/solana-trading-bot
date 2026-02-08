import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Play, Pause, Trash2, ExternalLink, CheckCircle, XCircle, Activity } from 'lucide-react'
import { TradingRule, rulesApi } from '../services/api'
import { useToast } from './Toast'

interface RuleCardProps {
  rule: TradingRule
}

export default function RuleCard({ rule }: RuleCardProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const toggleRule = useMutation({
    mutationFn: () => rulesApi.toggle(rule.id),
    onSuccess: (updatedRule) => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      toast.success(
        `Rule ${updatedRule.status === 'active' ? 'resumed' : 'paused'}`,
        rule.parsed_summary || rule.user_input
      )
    },
    onError: (error) => {
      toast.error('Failed to toggle rule', (error as Error).message)
    },
  })

  const deleteRule = useMutation({
    mutationFn: () => rulesApi.delete(rule.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      toast.success('Rule deleted', rule.parsed_summary || rule.user_input)
    },
    onError: (error) => {
      toast.error('Failed to delete rule', (error as Error).message)
    },
  })

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this rule?')) {
      deleteRule.mutate()
    }
  }

  const statusConfig = {
    active: {
      bg: 'bg-success-500/10',
      border: 'border-success-500/30',
      hoverBorder: 'hover:border-success-400/50',
      text: 'text-success-400',
      icon: Activity,
      label: 'Active',
    },
    paused: {
      bg: 'bg-warning-500/10',
      border: 'border-warning-500/30',
      hoverBorder: 'hover:border-warning-400/50',
      text: 'text-warning-400',
      icon: Pause,
      label: 'Paused',
    },
    triggered: {
      bg: 'bg-info-500/10',
      border: 'border-info-500/30',
      hoverBorder: 'hover:border-info-400/50',
      text: 'text-info-400',
      icon: CheckCircle,
      label: 'Triggered',
    },
    expired: {
      bg: 'bg-dark-600/30',
      border: 'border-dark-600/50',
      hoverBorder: 'hover:border-dark-500/50',
      text: 'text-dark-400',
      icon: XCircle,
      label: 'Expired',
    },
  }

  const config = statusConfig[rule.status]
  const StatusIcon = config.icon

  return (
    <div className={`card-interactive bg-dark-800/80 rounded-2xl p-5 border ${config.border} ${config.hoverBorder} group`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`badge ${config.bg} ${config.text} border ${config.border}`}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </span>
          <span className="text-sm text-dark-400 font-medium font-mono">{rule.market}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {(rule.status === 'active' || rule.status === 'paused') && (
            <button
              onClick={() => toggleRule.mutate()}
              disabled={toggleRule.isPending}
              className={`p-2 rounded-lg transition-all duration-200 ${
                rule.status === 'active'
                  ? 'hover:bg-warning-500/20 text-warning-400 hover:scale-110'
                  : 'hover:bg-success-500/20 text-success-400 hover:scale-110'
              } disabled:opacity-50 disabled:hover:scale-100`}
              title={rule.status === 'active' ? 'Pause rule' : 'Resume rule'}
            >
              {rule.status === 'active' ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleteRule.isPending}
            className="p-2 hover:bg-danger-500/20 rounded-lg transition-all duration-200 text-danger-400 disabled:opacity-50 hover:scale-110 disabled:hover:scale-100"
            title="Delete rule"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <Link to={`/rules/${rule.id}`} className="block">
        <p className="text-dark-100 mb-3 group-hover:text-white transition-colors font-medium line-clamp-2">
          {rule.parsed_summary || rule.user_input}
        </p>

        {/* Condition preview */}
        <div className="flex items-center gap-2 text-xs mb-3 flex-wrap">
          <span className="bg-dark-700/60 text-dark-300 px-2.5 py-1 rounded-lg font-medium">
            {rule.condition_type.replace(/_/g, ' ')}
          </span>
          <span className="bg-dark-700/60 text-dark-300 px-2.5 py-1 rounded-lg font-mono">
            ${rule.condition_value}
          </span>
          <span className="bg-dark-700/60 text-dark-300 px-2.5 py-1 rounded-lg">
            {rule.action_type} {rule.action_amount_percent}%
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-sm text-dark-500">
          <span>
            Created {formatDistanceToNow(new Date(rule.created_at), { addSuffix: true })}
          </span>
          <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Triggered timestamp */}
      {rule.triggered_at && (
        <div className="mt-4 pt-3 border-t border-dark-700/50">
          <p className="text-sm text-info-400 flex items-center gap-2 font-medium">
            <CheckCircle className="h-4 w-4" />
            Triggered {formatDistanceToNow(new Date(rule.triggered_at), { addSuffix: true })}
          </p>
        </div>
      )}
    </div>
  )
}
