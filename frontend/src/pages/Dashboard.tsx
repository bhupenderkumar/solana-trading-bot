import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useWallet } from '@solana/wallet-adapter-react'
import { rulesApi, conversationApi, pricesApi, Conversation } from '../services/api'
import RuleInput from '../components/RuleInput'
import RuleCard from '../components/RuleCard'
import PriceDisplay from '../components/PriceDisplay'
import PriceChart from '../components/PriceChart'
import WalletInfo from '../components/WalletInfo'
import SearchFilter from '../components/SearchFilter'
import { RuleCardSkeleton } from '../components/Skeleton'
import { 
  Inbox, AlertCircle, ChevronDown, MessageSquare, ArrowRight,
  Activity, Zap, Clock, Sparkles, TrendingUp, Target,
  BarChart3, Layers, ArrowUpRight, PauseCircle, CheckCircle2,
  Filter, RefreshCw, Eye, EyeOff, ChevronRight
} from 'lucide-react'

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.5 }
  }
}

const QUICK_ACTIONS = [
  {
    title: 'Create Rule',
    description: 'Set up automated trading triggers',
    icon: Target,
    color: 'from-indigo-500 to-purple-600',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
    iconColor: 'text-indigo-400',
    href: '/chat',
    example: 'Buy SOL below $80'
  },
  {
    title: 'Check Prices',
    description: 'Real-time market data',
    icon: TrendingUp,
    color: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    iconColor: 'text-emerald-400',
    href: '/chat',
    example: 'SOL, BTC, ETH prices'
  },
  {
    title: 'Analyze',
    description: 'Performance insights',
    icon: BarChart3,
    color: 'from-amber-500 to-orange-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    iconColor: 'text-amber-400',
    href: '/chat',
    example: 'Best performer today'
  },
]

// Stat card component
function StatCard({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color,
  delay = 0 
}: { 
  title: string
  value: string | number
  change?: string
  icon: React.ElementType
  color: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="relative group"
    >
      <div className={`absolute inset-0 ${color} rounded-2xl blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500`} />
      <div className="relative bg-gray-900/60 backdrop-blur-xl border border-gray-700/40 rounded-2xl p-6 hover:border-gray-600/50 transition-all duration-300">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-xl ${color.replace('bg-gradient-to-br', 'bg-gradient-to-br').replace(/from-(\w+)-500/, 'from-$1-500/20').replace(/to-(\w+)-600/, 'to-$1-600/20')} border border-white/5`}>
            <Icon className={`h-5 w-5 ${color.includes('emerald') ? 'text-emerald-400' : color.includes('amber') ? 'text-amber-400' : color.includes('cyan') ? 'text-cyan-400' : 'text-indigo-400'}`} />
          </div>
          {change && (
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${change.startsWith('+') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {change}
            </span>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm text-gray-400 font-medium">{title}</p>
          <p className="text-2xl font-bold text-white font-heading tracking-tight">{value}</p>
        </div>
      </div>
    </motion.div>
  )
}

// Price ticker item
function PriceTickerItem({ market, price, index }: { market: string; price: number; index: number }) {
  const formatPrice = (p: number) => {
    if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    if (p >= 1) return `$${p.toFixed(2)}`
    return `$${p.toFixed(4)}`
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="flex items-center gap-3 px-4 py-3 bg-gray-800/30 rounded-xl border border-gray-700/30 hover:border-gray-600/50 transition-colors cursor-pointer group"
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center border border-indigo-500/20">
        <span className="text-xs font-bold text-indigo-400">{market.slice(0, 1)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{market.replace('-PERP', '')}</p>
        <p className="text-xs text-gray-500">Perpetual</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-white font-mono">{formatPrice(price)}</p>
        <p className="text-xs text-emerald-400">Live</p>
      </div>
      <ArrowUpRight className="h-4 w-4 text-gray-500 group-hover:text-indigo-400 transition-colors" />
    </motion.div>
  )
}

// Activity item component
function ActivityItem({ conversation, index }: { conversation: Conversation; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link
        to="/chat"
        className="flex items-center gap-4 p-4 bg-gray-800/30 hover:bg-gray-800/50 rounded-xl border border-gray-700/30 hover:border-indigo-500/30 transition-all duration-300 group"
      >
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
          <MessageSquare className="h-5 w-5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate group-hover:text-indigo-400 transition-colors">
            {conversation.title}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(conversation.updated_at || conversation.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
            {conversation.stats && conversation.stats.total_rules && conversation.stats.total_rules > 0 && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Activity className="h-3 w-3" />
                {conversation.stats.active_rules} active
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all duration-300" />
      </Link>
    </motion.div>
  )
}

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [marketFilter, setMarketFilter] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showAllConversations, setShowAllConversations] = useState(false)
  const [showAllPrices, setShowAllPrices] = useState(false)
  
  // Get connected wallet address
  const { publicKey } = useWallet()
  const walletAddress = publicKey?.toBase58()

  const { data: rules, isLoading, error } = useQuery({
    queryKey: ['rules', walletAddress],
    queryFn: () => rulesApi.list(undefined, walletAddress),
    refetchInterval: 10000,
  })

  const { data: conversations } = useQuery({
    queryKey: ['conversations', walletAddress],
    queryFn: () => conversationApi.list(walletAddress),
    refetchInterval: 30000,
  })

  const { data: prices, refetch: refetchPrices } = useQuery({
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
      if (statusFilter && rule.status !== statusFilter) return false
      if (marketFilter && rule.market !== marketFilter) return false
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

  // Calculate stats
  const totalRules = rules?.length || 0
  const activeCount = rules?.filter(r => r.status === 'active').length || 0
  const triggeredCount = rules?.filter(r => r.status === 'triggered').length || 0
  const totalConversations = conversations?.length || 0

  return (
    <div className="space-y-8 pb-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white font-heading tracking-tight">
            Dashboard
          </h1>
          <p className="text-gray-400 mt-1">
            Monitor your trading rules and market activity
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetchPrices()}
            className="p-2.5 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/50 rounded-xl text-gray-400 hover:text-white transition-all"
            title="Refresh prices"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-white font-semibold text-sm hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
          >
            <MessageSquare className="h-4 w-4" />
            Open Chat
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Rules"
          value={totalRules}
          icon={Layers}
          color="bg-gradient-to-br from-indigo-500 to-purple-600"
          delay={0}
        />
        <StatCard
          title="Active Rules"
          value={activeCount}
          change={activeCount > 0 ? `${Math.round((activeCount / Math.max(totalRules, 1)) * 100)}%` : undefined}
          icon={Activity}
          color="bg-gradient-to-br from-emerald-500 to-teal-600"
          delay={0.1}
        />
        <StatCard
          title="Triggered"
          value={triggeredCount}
          icon={Zap}
          color="bg-gradient-to-br from-amber-500 to-orange-600"
          delay={0.2}
        />
        <StatCard
          title="Conversations"
          value={totalConversations}
          icon={MessageSquare}
          color="bg-gradient-to-br from-cyan-500 to-blue-600"
          delay={0.3}
        />
      </div>

      {/* Quick Actions */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid md:grid-cols-3 gap-4"
      >
        {QUICK_ACTIONS.map((action) => (
          <motion.div key={action.title} variants={itemVariants}>
            <Link
              to={action.href}
              className="group relative block p-6 bg-gray-900/60 backdrop-blur-xl border border-gray-700/40 rounded-2xl hover:border-gray-600/50 transition-all duration-300 overflow-hidden"
            >
              {/* Gradient overlay on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${action.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
              
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl ${action.bgColor} border ${action.borderColor}`}>
                    <action.icon className={`h-6 w-6 ${action.iconColor}`} />
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-300" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1 font-heading">{action.title}</h3>
                <p className="text-sm text-gray-400 mb-4">{action.description}</p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg border border-gray-700/50">
                  <span className="text-xs text-gray-300 font-mono">"{action.example}"</span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Prices */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="lg:col-span-1"
        >
          <div className="bg-gray-900/60 backdrop-blur-xl border border-gray-700/40 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-700/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white font-heading">Live Prices</h2>
                  <p className="text-xs text-gray-500">Real-time market data</p>
                </div>
              </div>
              <button
                onClick={() => setShowAllPrices(!showAllPrices)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
              >
                {showAllPrices ? 'Show less' : 'View all'}
                <ChevronDown className={`h-3 w-3 transition-transform ${showAllPrices ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
              {prices && typeof prices === 'object' ? (
                Object.entries(prices)
                  .slice(0, showAllPrices ? undefined : 5)
                  .map(([market, price], index) => (
                    <PriceTickerItem key={market} market={market} price={price as number} index={index} />
                  ))
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  Loading prices...
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Middle Column - Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="lg:col-span-2"
        >
          <div className="bg-gray-900/60 backdrop-blur-xl border border-gray-700/40 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-700/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white font-heading">Recent Activity</h2>
                  <p className="text-xs text-gray-500">Your latest conversations</p>
                </div>
              </div>
              <Link
                to="/chat"
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="p-4 space-y-2">
              {conversations && conversations.length > 0 ? (
                <>
                  {(showAllConversations ? conversations : conversations.slice(0, 4)).map((conv, index) => (
                    <ActivityItem key={conv.id} conversation={conv} index={index} />
                  ))}
                  {conversations.length > 4 && (
                    <button
                      onClick={() => setShowAllConversations(!showAllConversations)}
                      className="w-full text-center py-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {showAllConversations ? 'Show less' : `Show all ${conversations.length} conversations`}
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                  <p className="text-sm text-gray-400 mb-4">No conversations yet</p>
                  <Link
                    to="/chat"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-white text-sm font-medium transition-colors"
                  >
                    <Sparkles className="h-4 w-4" />
                    Start Your First Chat
                  </Link>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Expandable Details Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-3 mx-auto px-6 py-3 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/50 rounded-xl text-gray-400 hover:text-white transition-all duration-300"
        >
          {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="text-sm font-medium">
            {showDetails ? 'Hide' : 'Show'} detailed analytics
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showDetails ? 'rotate-180' : ''}`} />
        </button>
      </motion.div>

      {showDetails && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
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
        </motion.div>
      )}

      {/* Rule Input */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <RuleInput />
      </motion.div>

      {/* Search and Filter */}
      {rules && rules.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <SearchFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            marketFilter={marketFilter}
            onMarketFilterChange={setMarketFilter}
            markets={markets}
          />
        </motion.div>
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
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex items-start gap-4"
        >
          <div className="p-2 bg-red-500/10 rounded-xl">
            <AlertCircle className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-red-400 font-heading">Error loading rules</h3>
            <p className="text-sm text-gray-400 mt-1">{(error as Error).message}</p>
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {rules && rules.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900/60 backdrop-blur-xl border border-gray-700/40 rounded-2xl p-12 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Inbox className="h-8 w-8 text-indigo-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-white font-heading">No trading rules yet</h3>
          <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
            Create your first automated trading rule using natural language.
            Try something like "If SOL drops $5, sell my entire position".
          </p>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-white font-semibold hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
          >
            <MessageSquare className="h-5 w-5" />
            Create Your First Rule
          </Link>
        </motion.div>
      )}

      {/* No Results State */}
      {rules && rules.length > 0 && filteredRules.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-gray-900/60 backdrop-blur-xl border border-gray-700/40 rounded-2xl p-10 text-center"
        >
          <Filter className="h-8 w-8 mx-auto mb-3 text-gray-500" />
          <p className="text-gray-400 mb-2">No rules match your filters</p>
          <button
            onClick={() => {
              setSearchQuery('')
              setStatusFilter(null)
              setMarketFilter(null)
            }}
            className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
          >
            Clear all filters
          </button>
        </motion.div>
      )}

      {/* Active Rules */}
      {activeRules.length > 0 && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="relative">
              <span className="flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <h2 className="text-xl font-semibold text-white font-heading">Active Rules</h2>
            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20">
              {activeRules.length}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {activeRules.map((rule, index) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <RuleCard rule={rule} />
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Paused Rules */}
      {pausedRules.length > 0 && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center gap-3 mb-5">
            <PauseCircle className="h-4 w-4 text-amber-500" />
            <h2 className="text-xl font-semibold text-white font-heading">Paused Rules</h2>
            <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 text-xs font-semibold rounded-full border border-amber-500/20">
              {pausedRules.length}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {pausedRules.map((rule, index) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <RuleCard rule={rule} />
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Triggered Rules */}
      {triggeredRules.length > 0 && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center gap-3 mb-5">
            <CheckCircle2 className="h-4 w-4 text-cyan-500" />
            <h2 className="text-xl font-semibold text-white font-heading">Triggered Rules</h2>
            <span className="px-2.5 py-1 bg-cyan-500/10 text-cyan-400 text-xs font-semibold rounded-full border border-cyan-500/20">
              {triggeredRules.length}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {triggeredRules.map((rule, index) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <RuleCard rule={rule} />
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  )
}
