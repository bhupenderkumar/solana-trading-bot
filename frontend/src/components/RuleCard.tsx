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
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      hoverBorder: 'hover:border-emerald-400/40',
      text: 'text-emerald-400',
      icon: Activity,
      label: 'Active',
    },
    paused: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      hoverBorder: 'hover:border-amber-400/40',
      text: 'text-amber-400',
      icon: Pause,
      label: 'Paused',
    },
    triggered: {
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
      hoverBorder: 'hover:border-cyan-400/40',
      text: 'text-cyan-400',
      icon: CheckCircle,
      label: 'Triggered',
    },
    expired: {
      bg: 'bg-gray-600/30',
      border: 'border-gray-600/30',
      hoverBorder: 'hover:border-gray-500/50',
      text: 'text-gray-400',
      icon: XCircle,
      label: 'Expired',
    },
  }

  const config = statusConfig[rule.status]
  const StatusIcon = config.icon

  return (
    <div className={`card-interactive bg-gray-800/50 rounded-2xl p-5 border ${config.border} ${config.hoverBorder} group`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`badge ${config.bg} ${config.text} border ${config.border}`}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </span>
          <span className="text-sm text-gray-400 font-medium font-mono">{rule.market}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
          {(rule.status === 'active' || rule.status === 'paused') && (
            <button
              onClick={() => toggleRule.mutate()}
              disabled={toggleRule.isPending}
              className={`p-2 rounded-xl transition-all duration-300 ${
                rule.status === 'active'
                  ? 'hover:bg-amber-500/15 text-amber-400 hover:scale-110'
                  : 'hover:bg-emerald-500/15 text-emerald-400 hover:scale-110'
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
            className="p-2 hover:bg-red-500/15 rounded-xl transition-all duration-300 text-red-400 disabled:opacity-50 hover:scale-110 disabled:hover:scale-100"
            title="Delete rule"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <Link to={`/rules/${rule.id}`} className="block">
        <p className="text-gray-200 mb-3 group-hover:text-white transition-colors duration-300 font-medium line-clamp-2">
          {rule.parsed_summary || rule.user_input}
        </p>

        {/* Condition preview */}
        <div className="flex items-center gap-2 text-xs mb-3 flex-wrap">
          <span className="bg-gray-700/50 text-gray-300 px-2.5 py-1.5 rounded-lg font-medium">
            {rule.condition_type.replace(/_/g, ' ')}
          </span>
          <span className="bg-gray-700/50 text-gray-300 px-2.5 py-1.5 rounded-lg font-mono">
            ${rule.condition_value}
          </span>
          <span className="bg-gray-700/50 text-gray-300 px-2.5 py-1.5 rounded-lg">
            {rule.action_type} {rule.action_amount_percent}%
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Created {formatDistanceToNow(new Date(rule.created_at), { addSuffix: true })}
          </span>
          <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Triggered timestamp */}
      {rule.triggered_at && (
        <div className="mt-4 pt-3 border-t border-gray-700/30">
          <p className="text-sm text-cyan-400 flex items-center gap-2 font-medium">
            <CheckCircle className="h-4 w-4" />
            Triggered {formatDistanceToNow(new Date(rule.triggered_at), { addSuffix: true })}
          </p>
        </div>
      )}
    </div>
  )
}
