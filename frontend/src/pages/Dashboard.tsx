import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { rulesApi } from '../services/api'
import StatsOverview from '../components/StatsOverview'
import RuleInput from '../components/RuleInput'
import RuleCard from '../components/RuleCard'
import PriceDisplay from '../components/PriceDisplay'
import PriceChart from '../components/PriceChart'
import WalletInfo from '../components/WalletInfo'
import SearchFilter from '../components/SearchFilter'
import { RuleCardSkeleton } from '../components/Skeleton'
import { Inbox, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [marketFilter, setMarketFilter] = useState<string | null>(null)
  const [showPriceChart, setShowPriceChart] = useState(true)

  const { data: rules, isLoading, error } = useQuery({
    queryKey: ['rules'],
    queryFn: () => rulesApi.list(),
    refetchInterval: 10000,
  })

  // Get unique markets for filter
  const markets = useMemo(() => {
    if (!rules) return []
    return [...new Set(rules.map(r => r.market))]
  }, [rules])

  // Filter rules
  const filteredRules = useMemo(() => {
    if (!rules) return []

    return rules.filter(rule => {
      // Status filter
      if (statusFilter && rule.status !== statusFilter) return false

      // Market filter
      if (marketFilter && rule.market !== marketFilter) return false

      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesInput = rule.user_input.toLowerCase().includes(query)
        const matchesSummary = rule.parsed_summary?.toLowerCase().includes(query)
        const matchesMarket = rule.market.toLowerCase().includes(query)
        if (!matchesInput && !matchesSummary && !matchesMarket) return false
      }

      return true
    })
  }, [rules, statusFilter, marketFilter, searchQuery])

  // Group filtered rules by status
  const activeRules = filteredRules.filter(r => r.status === 'active')
  const pausedRules = filteredRules.filter(r => r.status === 'paused')
  const triggeredRules = filteredRules.filter(r => r.status === 'triggered')

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Trading Dashboard</h1>
          <p className="text-dark-400 mt-1">Monitor and manage your automated trading rules</p>
        </div>
      </div>

      {/* Stats Overview */}
      <StatsOverview />

      {/* Wallet Info */}
      <WalletInfo />

      {/* Price Display */}
      <PriceDisplay />

      {/* Historical Price Chart - Collapsible */}
      <div>
        <button
          onClick={() => setShowPriceChart(!showPriceChart)}
          className="flex items-center gap-2 text-sm text-dark-400 hover:text-white transition-colors mb-2"
        >
          {showPriceChart ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {showPriceChart ? 'Hide' : 'Show'} Historical Price Chart
        </button>
        {showPriceChart && (
          <PriceChart
            market="SOL-PERP"
            defaultDays={20}
            showStats={true}
            showOHLC={true}
          />
        )}
      </div>

      {/* Rule Input */}
      <RuleInput />

      {/* Search and Filter */}
      {(rules && rules.length > 0) && (
        <SearchFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          marketFilter={marketFilter}
          onMarketFilterChange={setMarketFilter}
          markets={markets}
        />
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => (
            <RuleCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-danger-500/10 border border-danger-500/30 rounded-2xl p-6 flex items-start gap-4">
          <AlertCircle className="h-6 w-6 text-danger-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-danger-400">Error loading rules</h3>
            <p className="text-sm text-dark-400 mt-1">{(error as Error).message}</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {rules && rules.length === 0 && (
        <div className="card rounded-2xl p-12 text-center">
          <Inbox className="h-12 w-12 text-dark-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2 text-white">No trading rules yet</h3>
          <p className="text-sm text-dark-400 max-w-md mx-auto">
            Create your first automated trading rule using natural language.
            Try something like "If SOL drops $5, sell my entire position".
          </p>
        </div>
      )}

      {/* No Results State */}
      {rules && rules.length > 0 && filteredRules.length === 0 && (
        <div className="card rounded-2xl p-8 text-center">
          <p className="text-dark-400">No rules match your filters</p>
          <button
            onClick={() => {
              setSearchQuery('')
              setStatusFilter(null)
              setMarketFilter(null)
            }}
            className="text-primary-400 hover:text-primary-300 text-sm mt-2 transition-colors"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Active Rules */}
      {activeRules.length > 0 && (
        <section className="animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <span className="flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-success-500"></span>
              </span>
            </div>
            <h2 className="text-xl font-semibold text-success-400">
              Active Rules
            </h2>
            <span className="text-sm text-dark-400">({activeRules.length})</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {activeRules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
          </div>
        </section>
      )}

      {/* Paused Rules */}
      {pausedRules.length > 0 && (
        <section className="animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <span className="h-3 w-3 rounded-full bg-warning-500"></span>
            <h2 className="text-xl font-semibold text-warning-400">
              Paused Rules
            </h2>
            <span className="text-sm text-dark-400">({pausedRules.length})</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {pausedRules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
          </div>
        </section>
      )}

      {/* Triggered Rules */}
      {triggeredRules.length > 0 && (
        <section className="animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <span className="h-3 w-3 rounded-full bg-info-500"></span>
            <h2 className="text-xl font-semibold text-info-400">
              Triggered Rules
            </h2>
            <span className="text-sm text-dark-400">({triggeredRules.length})</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {triggeredRules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
