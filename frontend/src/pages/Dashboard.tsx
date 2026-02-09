import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { rulesApi, conversationApi, pricesApi } from '../services/api'
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
  Activity, Zap, Clock, Sparkles, TrendingUp, Target, DollarSign, Bot
} from 'lucide-react'

const FEATURE_CARDS = [
  {
    title: 'Create Trading Rules',
    description: 'Set automated buy/sell triggers using natural language',
    example: '"Buy SOL when it drops below $80"',
    icon: Target,
    color: 'from-indigo-500/20 to-purple-600/10',
    iconColor: 'text-indigo-400',
  },
  {
    title: 'Track Market Prices',
    description: 'Real-time prices for all major crypto assets',
    example: '"What\'s the price of BTC?"',
    icon: TrendingUp,
    color: 'from-emerald-500/20 to-teal-600/10',
    iconColor: 'text-emerald-400',
  },
  {
    title: 'Analyze Performance',
    description: 'Compare coins and calculate potential profits',
    example: '"Which coin performed best this week?"',
    icon: DollarSign,
    color: 'from-amber-500/20 to-orange-600/10',
    iconColor: 'text-amber-400',
  },
]

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [marketFilter, setMarketFilter] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
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

  const { data: prices } = useQuery({
    queryKey: ['prices'],
    queryFn: pricesApi.getAll,
    refetchInterval: 10000,
  })

  // Get unique markets for filter
  const markets = useMemo(() => {
    if (!rules || !Array.isArray(rules)) return []
    return [...new Set(rules.map(r => r.market))]
  }, [rules])

  // Filter rules
  const filteredRules = useMemo(() => {
    if (!rules || !Array.isArray(rules)) return []

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

  // Format price for display
  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    if (price >= 1) return `$${price.toFixed(2)}`
    return `$${price.toFixed(4)}`
  }

  return (
    <div className="space-y-8">
      {/* Hero Section with Chat CTA */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900/80 via-gray-900/60 to-gray-900/80 border border-gray-700/30 animate-in">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative p-6 md:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-indigo-500/15 rounded-lg border border-indigo-500/20">
                  <Bot className="h-5 w-5 text-indigo-400" />
                </div>
                <span className="text-xs font-medium text-indigo-400 uppercase tracking-wider">AI Trading Assistant</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                Trade Smarter with <span className="text-indigo-400">Natural Language</span>
              </h1>
              <p className="text-gray-400 text-lg leading-relaxed">
                Create automated trading rules, check prices, and analyze your portfolio — just by chatting.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link 
                to="/chat" 
                className="btn-primary py-3.5 px-6 flex items-center justify-center gap-2 text-base font-semibold"
              >
                <MessageSquare className="h-5 w-5" />
                Open Chat
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>

          {/* Quick Price Ticker */}
          {prices && typeof prices === 'object' && (
            <div className="mt-6 pt-6 border-t border-gray-700/30">
              <div className="flex items-center gap-6 overflow-x-auto pb-2 scrollbar-thin">
                {Object.entries(prices).slice(0, 5).map(([market, price]) => (
                  <div key={market} className="flex items-center gap-2 text-sm whitespace-nowrap">
                    <span className="text-gray-500 font-medium">{market.replace('-PERP', '')}</span>
                    <span className="text-white font-semibold">{formatPrice(price)}</span>
                  </div>
                ))}
                <Link to="/chat" className="text-indigo-400 hover:text-indigo-300 text-xs font-medium flex items-center gap-1 transition-colors">
                  View all prices
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid md:grid-cols-3 gap-4 animate-in-delay-1">
        {FEATURE_CARDS.map((card) => (
          <Link
            key={card.title}
            to="/chat"
            className={`card-interactive rounded-2xl p-5 bg-gradient-to-br ${card.color} group`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-gray-900/50 rounded-xl border border-gray-700/30 group-hover:border-gray-600/50 transition-colors">
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <h3 className="font-semibold text-white">{card.title}</h3>
            </div>
            <p className="text-sm text-gray-400 mb-3">{card.description}</p>
            <div className="text-xs bg-gray-900/40 px-3 py-2 rounded-lg text-gray-300 font-mono">
              {card.example}
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="animate-in-delay-2">
        <StatsOverview />
      </div>

      {/* Recent Conversations Section */}
      <div className="card rounded-2xl overflow-hidden animate-in-delay-3">
        <div className="p-5 border-b border-gray-700/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/15 rounded-lg border border-indigo-500/20">
              <Sparkles className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
              <p className="text-xs text-gray-500">Your recent conversations and rules</p>
            </div>
          </div>
          <Link 
            to="/chat" 
            className="btn-ghost py-2 px-4 flex items-center gap-2 text-sm"
          >
            View All
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Content */}
        <div className="p-5">
          {conversations && conversations.length > 0 ? (
            <div className="space-y-2">
              {(showAllConversations ? conversations : conversations.slice(0, 3)).map((conv) => (
                <Link
                  key={conv.id}
                  to="/chat"
                  className="block p-4 bg-gray-900/40 hover:bg-gray-800/50 rounded-xl border border-gray-700/30 hover:border-indigo-500/30 transition-all duration-300 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate group-hover:text-indigo-400 transition-colors">
                        {conv.title}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
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
                          </div>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0" />
                  </div>
                </Link>
              ))}
              
              {conversations.length > 3 && (
                <button
                  onClick={() => setShowAllConversations(!showAllConversations)}
                  className="w-full text-center py-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {showAllConversations ? 'Show less' : `Show all ${conversations.length} conversations`}
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 text-gray-600" />
              <p className="text-sm text-gray-400 mb-3">No conversations yet</p>
              <Link to="/chat" className="btn-primary py-2 px-4 inline-flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4" />
                Start Your First Chat
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Expandable Details Section */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-all duration-300 mx-auto"
      >
        {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {showDetails ? 'Hide' : 'Show'} detailed view (prices, wallet, chart)
      </button>

      {showDetails && (
        <div className="space-y-6 animate-slide-down">
          {/* Wallet Info */}
          <WalletInfo />

          {/* Price Display */}
          <PriceDisplay />

          {/* Historical Price Chart */}
          <PriceChart
            market="SOL-PERP"
            defaultDays={20}
            showStats={true}
            showOHLC={true}
          />
        </div>
      )}

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
