import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  CheckCircle,
  PauseCircle
} from 'lucide-react'
import { rulesApi, TradingRule } from '../services/api'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color: 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'default'
}

function StatCard({ title, value, subtitle, icon, trend, trendValue, color }: StatCardProps) {
  const colorStyles = {
    primary: 'from-primary-500/20 via-primary-500/10 to-transparent border-primary-500/30 hover:border-primary-400/50',
    success: 'from-success-500/20 via-success-500/10 to-transparent border-success-500/30 hover:border-success-400/50',
    info: 'from-info-500/20 via-info-500/10 to-transparent border-info-500/30 hover:border-info-400/50',
    warning: 'from-warning-500/20 via-warning-500/10 to-transparent border-warning-500/30 hover:border-warning-400/50',
    danger: 'from-danger-500/20 via-danger-500/10 to-transparent border-danger-500/30 hover:border-danger-400/50',
    default: 'from-dark-700/50 via-dark-700/30 to-transparent border-dark-600/50 hover:border-dark-500/50',
  }

  const iconColors = {
    primary: 'text-primary-400 bg-primary-500/20',
    success: 'text-success-400 bg-success-500/20',
    info: 'text-info-400 bg-info-500/20',
    warning: 'text-warning-400 bg-warning-500/20',
    danger: 'text-danger-400 bg-danger-500/20',
    default: 'text-dark-400 bg-dark-700/50',
  }

  return (
    <div className={`bg-gradient-to-br ${colorStyles[color]} border rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg group`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-dark-400 font-medium mb-1">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-white">{value}</p>
          {subtitle && (
            <p className="text-xs text-dark-500 mt-1.5">{subtitle}</p>
          )}
        </div>
        <div className={`p-2.5 rounded-xl ${iconColors[color]} transition-transform group-hover:scale-110`}>
          {icon}
        </div>
      </div>
      {trend && trendValue && (
        <div className={`flex items-center gap-1.5 mt-3 text-sm font-medium ${
          trend === 'up' ? 'text-success-400' : trend === 'down' ? 'text-danger-400' : 'text-dark-400'
        }`}>
          {trend === 'up' ? <TrendingUp className="h-3.5 w-3.5" /> :
           trend === 'down' ? <TrendingDown className="h-3.5 w-3.5" /> : null}
          <span>{trendValue}</span>
        </div>
      )}
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="h-4 w-20 skeleton rounded"></div>
          <div className="h-9 w-14 skeleton rounded"></div>
          <div className="h-3 w-24 skeleton rounded"></div>
        </div>
        <div className="h-11 w-11 skeleton rounded-xl"></div>
      </div>
    </div>
  )
}

export default function StatsOverview() {
  const { data: rules, isLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: () => rulesApi.list(),
    refetchInterval: 10000,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  const stats = calculateStats(rules || [])

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard
        title="Total Rules"
        value={stats.total}
        subtitle={`${stats.triggeredToday} triggered today`}
        icon={<Target className="h-5 w-5" />}
        color="primary"
      />
      <StatCard
        title="Active"
        value={stats.active}
        subtitle="Monitoring markets"
        icon={<Activity className="h-5 w-5" />}
        color="success"
      />
      <StatCard
        title="Triggered"
        value={stats.triggered}
        subtitle="Executed successfully"
        icon={<CheckCircle className="h-5 w-5" />}
        color="info"
      />
      <StatCard
        title="Paused"
        value={stats.paused}
        subtitle="Ready to resume"
        icon={<PauseCircle className="h-5 w-5" />}
        color="warning"
      />
    </div>
  )
}

function calculateStats(rules: TradingRule[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const triggeredToday = rules.filter(r =>
    r.triggered_at && new Date(r.triggered_at) >= todayStart
  ).length

  return {
    total: rules.length,
    active: rules.filter(r => r.status === 'active').length,
    paused: rules.filter(r => r.status === 'paused').length,
    triggered: rules.filter(r => r.status === 'triggered').length,
    triggeredToday,
  }
}
