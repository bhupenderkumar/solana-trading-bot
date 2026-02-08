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
    primary: 'from-indigo-500/20 via-indigo-500/10 to-transparent border-indigo-500/20 hover:border-indigo-400/40',
    success: 'from-emerald-500/20 via-emerald-500/10 to-transparent border-emerald-500/20 hover:border-emerald-400/40',
    info: 'from-cyan-500/20 via-cyan-500/10 to-transparent border-cyan-500/20 hover:border-cyan-400/40',
    warning: 'from-amber-500/20 via-amber-500/10 to-transparent border-amber-500/20 hover:border-amber-400/40',
    danger: 'from-red-500/20 via-red-500/10 to-transparent border-red-500/20 hover:border-red-400/40',
    default: 'from-gray-700/50 via-gray-700/30 to-transparent border-gray-700/30 hover:border-gray-600/50',
  }

  const iconColors = {
    primary: 'text-indigo-400 bg-indigo-500/15',
    success: 'text-emerald-400 bg-emerald-500/15',
    info: 'text-cyan-400 bg-cyan-500/15',
    warning: 'text-amber-400 bg-amber-500/15',
    danger: 'text-red-400 bg-red-500/15',
    default: 'text-gray-400 bg-gray-700/50',
  }

  return (
    <div className={`bg-gradient-to-br ${colorStyles[color]} border rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400 font-medium mb-1">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-white">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1.5">{subtitle}</p>
          )}
        </div>
        <div className={`p-2.5 rounded-xl ${iconColors[color]} border border-current/10 transition-transform duration-300 group-hover:scale-110`}>
          {icon}
        </div>
      </div>
      {trend && trendValue && (
        <div className={`flex items-center gap-1.5 mt-3 text-sm font-medium ${
          trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400'
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
    <div className="bg-gray-800/50 border border-gray-700/30 rounded-2xl p-5">
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
