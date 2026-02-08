import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { rulesApi, conversationApi } from '../services/api'
import StatsOverview from '../components/StatsOverview'
import RuleInput from '../components/RuleInput'
import RuleCard from '../components/RuleCard'
import PriceDisplay from '../components/PriceDisplay'
import PriceChart from '../components/PriceChart'
import WalletInfo from '../components/WalletInfo'
import SearchFilter from '../components/SearchFilter'
import { RuleCardSkeleton } from '../components/Skeleton'
import { 
  Inbox, AlertCircle, ChevronDown, ChevronUp, MessageSquare, ArrowRight,
  Activity, Zap, Pause, Clock, Sparkles
} from 'lucide-react'

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [marketFilter, setMarketFilter] = useState<string | null>(null)
  const [showPriceChart, setShowPriceChart] = useState(true)
  const [showAllConversations, setShowAllConversations] = useState(false)

  const { data: rules, isLoading, error } = useQuery({
    queryKey: ['rules'],
    queryFn: () => rulesApi.list(),
    refetchInterval: 10000,
  })

  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: conversationApi.list,
    refetchInterval: 30000,
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-in">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Trading Dashboard</h1>
          <p className="text-gray-400 mt-1.5">Monitor and manage your automated trading rules</p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="animate-in-delay-1">
        <StatsOverview />
      </div>

      {/* Wallet Info */}
      <div className="animate-in-delay-2">
        <WalletInfo />
      </div>

      {/* Price Display */}
      <div className="animate-in-delay-3">
        <PriceDisplay />
      </div>

      {/* Historical Price Chart - Collapsible */}
      <div className="animate-in-delay-4">
        <button
          onClick={() => setShowPriceChart(!showPriceChart)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-all duration-300 mb-3 hover-lift"
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

      {/* Trading Assistant Quick Access */}
      <div className="card-interactive rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-gray-700/30 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/15 rounded-xl border border-indigo-500/20">
              <Sparkles className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Trading Assistant</h2>
              <p className="text-sm text-gray-400">AI-powered trading help & rule creation</p>
            </div>
          </div>
          <Link 
            to="/chat" 
            className="btn-primary py-2.5 px-5 flex items-center gap-2 text-sm"
          >
            <MessageSquare className="h-4 w-4" />
            Open Chat
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Recent Conversations */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-400 font-medium">Recent Conversations</span>
            {conversations && conversations.length > 3 && (
              <button
                onClick={() => setShowAllConversations(!showAllConversations)}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
              >
                {showAllConversations ? 'Show less' : `Show all (${conversations.length})`}
                <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${showAllConversations ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          {conversations && conversations.length > 0 ? (
            <div className="space-y-2">
              {(showAllConversations ? conversations : conversations.slice(0, 3)).map((conv) => (
                <Link
                  key={conv.id}
                  to="/chat"
                  className="block p-4 bg-gray-900/40 hover:bg-gray-800/50 rounded-xl border border-gray-700/30 hover:border-indigo-500/30 transition-all duration-300 group hover-lift"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate group-hover:text-indigo-400 transition-colors">
                        {conv.title}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Clock className="h-3 w-3 text-gray-500" />
                        <span className="text-xs text-gray-500">
                          {new Date(conv.updated_at || conv.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        
                        {/* Rule badges */}
                        {conv.stats.total_rules > 0 && (
                          <div className="flex items-center gap-1.5 ml-2">
                            {conv.stats.active_rules > 0 && (
                              <span className="badge-success text-2xs">
                                <Activity className="h-2.5 w-2.5" />
                                {conv.stats.active_rules}
                              </span>
                            )}
                            {conv.stats.triggered_rules > 0 && (
                              <span className="badge-primary text-2xs">
                                <Zap className="h-2.5 w-2.5" />
                                {conv.stats.triggered_rules}
                              </span>
                            )}
                            {conv.stats.paused_rules > 0 && (
                              <span className="badge-warning text-2xs">
                                <Pause className="h-2.5 w-2.5" />
                                {conv.stats.paused_rules}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No conversations yet</p>
              <Link to="/chat" className="text-sm text-indigo-400 hover:text-indigo-300 mt-2 inline-block transition-colors">
                Start your first chat →
              </Link>
            </div>
          )}
        </div>
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
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex items-start gap-4">
          <AlertCircle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-400">Error loading rules</h3>
            <p className="text-sm text-gray-400 mt-1">{(error as Error).message}</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {rules && rules.length === 0 && (
        <div className="card rounded-2xl p-12 text-center">
          <Inbox className="h-14 w-14 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2 text-white">No trading rules yet</h3>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Create your first automated trading rule using natural language.
            Try something like "If SOL drops $5, sell my entire position".
          </p>
        </div>
      )}

      {/* No Results State */}
      {rules && rules.length > 0 && filteredRules.length === 0 && (
        <div className="card rounded-2xl p-10 text-center">
          <p className="text-gray-400">No rules match your filters</p>
          <button
            onClick={() => {
              setSearchQuery('')
              setStatusFilter(null)
              setMarketFilter(null)
            }}
            className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 transition-colors"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Active Rules */}
      {activeRules.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <span className="flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <h2 className="text-xl font-semibold text-emerald-400">
              Active Rules
            </h2>
            <span className="badge-success">({activeRules.length})</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {activeRules.map((rule, index) => (
              <div key={rule.id} className="animate-in" style={{ animationDelay: `${index * 0.1}s` }}>
                <RuleCard rule={rule} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Paused Rules */}
      {pausedRules.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="h-3 w-3 rounded-full bg-amber-500"></span>
            <h2 className="text-xl font-semibold text-amber-400">
              Paused Rules
            </h2>
            <span className="badge-warning">({pausedRules.length})</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {pausedRules.map((rule, index) => (
              <div key={rule.id} className="animate-in" style={{ animationDelay: `${index * 0.1}s` }}>
                <RuleCard rule={rule} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Triggered Rules */}
      {triggeredRules.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="h-3 w-3 rounded-full bg-cyan-500"></span>
            <h2 className="text-xl font-semibold text-cyan-400">
              Triggered Rules
            </h2>
            <span className="badge-info">({triggeredRules.length})</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {triggeredRules.map((rule, index) => (
              <div key={rule.id} className="animate-in" style={{ animationDelay: `${index * 0.1}s` }}>
                <RuleCard rule={rule} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
