import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, CheckCircle, XCircle, Clock, ExternalLink, TrendingUp, TrendingDown, 
  Activity, Pause, Play, Trash2, AlertTriangle, Zap, Target, BarChart3, 
  RefreshCw, Timer, Search, Newspaper, LineChart, Sparkles, Send, MessageSquare, Loader2, Bot
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { rulesApi, pricesApi, RuleChatResponse } from '../services/api'
import { DetailPageSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'

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
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }
  }
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.4, ease: "easeOut" }
  }
}

const pulseVariants = {
  pulse: {
    scale: [1, 1.05, 1],
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" }
  }
}

// Fix timezone - ensure proper UTC parsing
function parseDate(dateString: string): Date {
  // If string doesn't end with Z, append it to treat as UTC
  if (dateString && !dateString.endsWith('Z') && !dateString.includes('+')) {
    dateString = dateString + 'Z'
  }
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? new Date() : date
}

function formatTimeAgo(dateString: string): string {
  const date = parseDate(dateString)
  return formatDistanceToNow(date, { addSuffix: true })
}

// Stat card component
function StatCard({ 
  label, 
  value, 
  subValue, 
  icon: Icon, 
  color, 
  trend,
  delay = 0 
}: { 
  label: string
  value: string | number
  subValue?: string
  icon: React.ElementType
  color: string
  trend?: 'up' | 'down' | 'neutral'
  delay?: number
}) {
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="relative group"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${color} rounded-2xl blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500`} />
      <div className="relative bg-gray-900/60 backdrop-blur-xl border border-gray-700/40 rounded-2xl p-5 hover:border-gray-600/50 transition-all duration-300">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color.replace('from-', 'from-').replace('/20', '/10')} border border-white/5`}>
            <Icon className={`h-4 w-4 ${color.includes('emerald') ? 'text-emerald-400' : color.includes('amber') ? 'text-amber-400' : color.includes('red') ? 'text-red-400' : color.includes('cyan') ? 'text-cyan-400' : 'text-indigo-400'}`} />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-medium ${
              trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400'
            }`}>
              {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : trend === 'down' ? <TrendingDown className="h-3 w-3" /> : null}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-white mt-1">{value}</p>
        {subValue && <p className="text-xs text-gray-500 mt-0.5">{subValue}</p>}
      </div>
    </motion.div>
  )
}

// Log entry component with animation
function LogEntry({ log, index, rule }: { log: any; index: number; rule: any }) {
  const isConditionNotMet = !log.condition_met && !log.error
  
  // Calculate the actual target price based on condition type
  const calculateTargetPrice = () => {
    if (!rule) return null
    if (rule.condition_type === 'price_change_percent' && rule.reference_price) {
      return rule.reference_price * (1 + rule.condition_value / 100)
    } else if (rule.condition_type === 'price_change_absolute' && rule.reference_price) {
      return rule.reference_price + rule.condition_value
    }
    return rule.condition_value // For price_above/price_below, condition_value is the target
  }
  
  const targetPrice = calculateTargetPrice()
  const currentPrice = log.current_price
  const priceDiff = currentPrice && targetPrice ? currentPrice - targetPrice : null
  const priceDiffPercent = currentPrice && targetPrice ? ((currentPrice - targetPrice) / targetPrice * 100) : null
  const conditionType = rule?.condition_type
  
  // Determine what's needed to trigger
  const getTriggerInfo = () => {
    if (!isConditionNotMet || !currentPrice || !targetPrice) return null
    
    if (conditionType === 'price_above' || (conditionType === 'price_change_percent' && rule?.condition_value > 0)) {
      return {
        needed: 'Price needs to go UP',
        diff: targetPrice - currentPrice,
        isBelow: currentPrice < targetPrice
      }
    } else if (conditionType === 'price_below' || (conditionType === 'price_change_percent' && rule?.condition_value < 0)) {
      return {
        needed: 'Price needs to go DOWN',
        diff: currentPrice - targetPrice,
        isBelow: currentPrice > targetPrice
      }
    }
    return null
  }
  
  const triggerInfo = getTriggerInfo()
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`flex items-start gap-3 p-4 rounded-xl transition-all duration-300 hover:scale-[1.01] ${
        log.error
          ? 'bg-red-500/10 border border-red-500/20 hover:border-red-500/40'
          : log.condition_met
          ? 'bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40'
          : 'bg-amber-500/5 border border-amber-500/20 hover:border-amber-500/40'
      }`}
    >
      <motion.div 
        className="mt-0.5"
        animate={log.condition_met ? { scale: [1, 1.2, 1] } : isConditionNotMet ? { rotate: [0, -10, 10, 0] } : {}}
        transition={{ duration: 0.5 }}
      >
        {log.error ? (
          <XCircle className="h-5 w-5 text-red-400" />
        ) : log.condition_met ? (
          <CheckCircle className="h-5 w-5 text-emerald-400" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        )}
      </motion.div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${log.error ? 'text-red-400' : log.condition_met ? 'text-emerald-400' : 'text-amber-400'}`}>
          {log.error ? 'Error' : log.condition_met ? 'Condition Met!' : 'Condition Not Met'}
        </p>
        <p className={`text-xs mt-0.5 ${log.error ? 'text-red-400/70' : 'text-gray-400'}`}>
          {log.error || log.message || 'Checking market conditions...'}
        </p>
        
        {/* Enhanced details for condition not met */}
        {isConditionNotMet && currentPrice && targetPrice && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 p-3 rounded-lg bg-gray-900/50 border border-gray-700/30 space-y-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-gray-500 block">Current Price</span>
                <span className="text-sm font-mono text-white">${currentPrice.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Target Price</span>
                <span className="text-sm font-mono text-cyan-400">${targetPrice.toFixed(2)}</span>
              </div>
            </div>
            
            {priceDiffPercent !== null && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-700/30">
                <span className="text-xs text-gray-500">Distance from target</span>
                <span className={`text-xs font-mono font-medium px-2 py-0.5 rounded ${
                  Math.abs(priceDiffPercent) < 1 ? 'bg-amber-500/20 text-amber-400' : 
                  Math.abs(priceDiffPercent) < 5 ? 'bg-orange-500/20 text-orange-400' : 
                  'bg-red-500/20 text-red-400'
                }`}>
                  {priceDiffPercent > 0 ? '+' : ''}{priceDiffPercent.toFixed(2)}% (${Math.abs(priceDiff!).toFixed(2)})
                </span>
              </div>
            )}
            
            {triggerInfo && (
              <div className="flex items-center gap-2 pt-2 border-t border-gray-700/30">
                {triggerInfo.isBelow ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                )}
                <span className="text-xs text-gray-400">
                  {triggerInfo.needed} by <span className="font-mono text-white">${triggerInfo.diff.toFixed(2)}</span>
                </span>
              </div>
            )}
          </motion.div>
        )}
        
        {/* Simple price display for other cases */}
        {!isConditionNotMet && log.current_price && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">Price:</span>
            <span className="text-xs font-mono text-white bg-gray-800/50 px-2 py-0.5 rounded">
              ${log.current_price.toFixed(2)}
            </span>
          </div>
        )}
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatTimeAgo(log.checked_at)}
      </span>
    </motion.div>
  )
}

// Next check countdown component
function NextCheckCountdown({ isActive }: { isActive: boolean }) {
  const [progress, setProgress] = useState(0)
  const [dots, setDots] = useState(0)
  
  useEffect(() => {
    if (!isActive) return
    
    // Progress bar - resets every 5 seconds (matches refetchInterval)
    const progressInterval = setInterval(() => {
      setProgress(prev => prev >= 100 ? 0 : prev + 2)
    }, 100)
    
    // Dots animation
    const dotsInterval = setInterval(() => {
      setDots(prev => (prev + 1) % 4)
    }, 400)
    
    return () => {
      clearInterval(progressInterval)
      clearInterval(dotsInterval)
    }
  }, [isActive])
  
  if (!isActive) return null
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 p-4 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/20"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <RefreshCw className="h-4 w-4 text-indigo-400" />
          </motion.div>
          <span className="text-sm font-medium text-indigo-400">
            Monitoring{'.'.repeat(dots)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-indigo-400"
          />
          <span className="text-xs text-gray-400">Next check incoming</span>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
      
      {/* Pulse rings when about to check */}
      {progress > 80 && (
        <motion.div 
          className="mt-3 flex items-center justify-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.span
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            className="text-xs font-medium text-pink-400"
          >
            ⚡ Checking Now!
          </motion.span>
        </motion.div>
      )}
    </motion.div>
  )
}

export default function RuleDetail() {
  const { id } = useParams<{ id: string }>()
  const ruleId = parseInt(id!, 10)
  const queryClient = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const { data: rule, isLoading: ruleLoading, refetch: refetchRule } = useQuery({
    queryKey: ['rule', ruleId],
    queryFn: () => rulesApi.get(ruleId),
  })

  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['ruleLogs', ruleId],
    queryFn: () => rulesApi.getLogs(ruleId),
    refetchInterval: 5000,
  })

  const { data: trades } = useQuery({
    queryKey: ['ruleTrades', ruleId],
    queryFn: () => rulesApi.getTrades(ruleId),
  })

  const { data: prices } = useQuery({
    queryKey: ['prices'],
    queryFn: pricesApi.getAll,
    refetchInterval: 10000,
  })

  // Chat mutation
  const sendChatMessage = useMutation({
    mutationFn: (message: string) => rulesApi.chat(ruleId, message),
    onSuccess: (response: RuleChatResponse) => {
      setChatMessages(prev => [...prev, { role: 'assistant', content: response.response }])
      
      // Handle rule updates
      if (response.action_taken === 'deleted') {
        toast.success('Agent terminated')
        setTimeout(() => navigate('/dashboard'), 1500)
      } else if (response.rule) {
        queryClient.invalidateQueries({ queryKey: ['rule', ruleId] })
        queryClient.invalidateQueries({ queryKey: ['rules'] })
        if (response.action_taken) {
          toast.success('Agent updated', response.action_taken.replace('_', ' '))
        }
      }
    },
    onError: (error) => {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I encountered an error: ${(error as Error).message}` }])
    }
  })

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatMessages])

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (chatInput.trim() && !sendChatMessage.isPending) {
      setChatMessages(prev => [...prev, { role: 'user', content: chatInput }])
      sendChatMessage.mutate(chatInput)
      setChatInput('')
    }
  }

  const toggleRule = useMutation({
    mutationFn: () => rulesApi.toggle(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rule', ruleId] })
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      toast.success('Agent updated', rule?.status === 'active' ? 'Agent paused' : 'Agent activated')
    },
    onError: (error) => {
      toast.error('Failed to update agent', (error as Error).message)
    }
  })

  const deleteRule = useMutation({
    mutationFn: () => rulesApi.delete(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      toast.success('Agent terminated')
      window.location.href = '/dashboard'
    },
    onError: (error) => {
      toast.error('Failed to terminate agent', (error as Error).message)
    }
  })

  if (ruleLoading) {
    return <DetailPageSkeleton />
  }

  if (!rule) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-20"
      >
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <XCircle className="h-10 w-10 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Agent not found</h2>
        <p className="text-gray-400 mb-6">This agent may have been terminated or doesn't exist.</p>
        <Link 
          to="/dashboard" 
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Return to Dashboard
        </Link>
      </motion.div>
    )
  }

  const currentPrice = prices?.[rule.market]
  
  // Calculate the actual target price based on condition type
  const calculateTargetPrice = () => {
    if (rule.condition_type === 'price_change_percent' && rule.reference_price) {
      return rule.reference_price * (1 + rule.condition_value / 100)
    } else if (rule.condition_type === 'price_change_absolute' && rule.reference_price) {
      return rule.reference_price + rule.condition_value
    }
    return rule.condition_value // For price_above/price_below, condition_value IS the target
  }
  
  const targetPrice = calculateTargetPrice()
  const priceDistance = currentPrice && targetPrice 
    ? ((currentPrice - targetPrice) / targetPrice * 100)
    : null
  const isCloseToTrigger = priceDistance !== null && Math.abs(priceDistance) < 5

  // Format condition display
  const getConditionDisplay = () => {
    if (rule.condition_type === 'price_change_percent') {
      const direction = rule.condition_value > 0 ? 'increase' : 'decrease'
      return `${Math.abs(rule.condition_value)}% ${direction}`
    }
    return rule.condition_type.replace(/_/g, ' ')
  }

  const statusConfig = {
    active: { 
      bg: 'bg-emerald-500/15', 
      text: 'text-emerald-400', 
      border: 'border-emerald-500/30',
      gradient: 'from-emerald-500/20 to-teal-500/10',
      icon: Activity,
      label: 'Active'
    },
    paused: { 
      bg: 'bg-amber-500/15', 
      text: 'text-amber-400', 
      border: 'border-amber-500/30',
      gradient: 'from-amber-500/20 to-orange-500/10',
      icon: Pause,
      label: 'Paused'
    },
    triggered: { 
      bg: 'bg-cyan-500/15', 
      text: 'text-cyan-400', 
      border: 'border-cyan-500/30',
      gradient: 'from-cyan-500/20 to-blue-500/10',
      icon: Zap,
      label: 'Triggered'
    },
    expired: { 
      bg: 'bg-gray-500/15', 
      text: 'text-gray-400', 
      border: 'border-gray-500/30',
      gradient: 'from-gray-500/20 to-gray-600/10',
      icon: Clock,
      label: 'Expired'
    },
  }

  const config = statusConfig[rule.status]
  const StatusIcon = config.icon

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 pb-8"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-all duration-300 group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          <span>Back to Dashboard</span>
        </Link>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { refetchRule(); refetchLogs(); }}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-all"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.button>
        </div>
      </motion.div>

      {/* Hero Card */}
      <motion.div 
        variants={itemVariants}
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${config.gradient} border ${config.border} p-6`}
      >
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-white/5 to-transparent rounded-full blur-3xl"
          />
        </div>

        <div className="relative">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <motion.div
                  variants={rule.status === 'active' ? pulseVariants : {}}
                  animate={rule.status === 'active' ? "pulse" : ""}
                  className={`p-3 rounded-xl ${config.bg} border ${config.border}`}
                >
                  <StatusIcon className={`h-6 w-6 ${config.text}`} />
                </motion.div>
                <motion.span 
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full ${config.bg} ${config.text} border ${config.border}`}
                >
                  {rule.status === 'active' && (
                    <motion.span
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-2 h-2 rounded-full bg-emerald-400"
                    />
                  )}
                  {config.label}
                </motion.span>
              </div>
              
              <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                {rule.parsed_summary || 'Trading Agent'}
              </h1>
              <p className="text-gray-400 text-lg">{rule.user_input}</p>
              
              <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  Created {formatTimeAgo(rule.created_at)}
                </span>
                {rule.triggered_at && (
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Zap className="h-4 w-4" />
                    Triggered {formatTimeAgo(rule.triggered_at)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex lg:flex-col gap-2">
              {(rule.status === 'active' || rule.status === 'paused') && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleRule.mutate()}
                  disabled={toggleRule.isPending}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
                    rule.status === 'active'
                      ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {rule.status === 'active' ? <><Pause className="h-4 w-4" /><span>Pause</span></> : <><Play className="h-4 w-4" /><span>Resume</span></>}
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { if (confirm('Delete this rule?')) deleteRule.mutate() }}
                disabled={deleteRule.isPending}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
              >
                <Trash2 className="h-4 w-4" /><span>Delete</span>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Market" value={rule.market.replace('-PERP', '')} subValue="Perpetual" icon={BarChart3} color="from-indigo-500 to-purple-600" delay={0.1} />
        <StatCard label="Target Price" value={`$${targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} subValue={getConditionDisplay()} icon={Target} color="from-cyan-500 to-blue-600" delay={0.2} />
        <StatCard label="Current Price" value={currentPrice ? `$${currentPrice.toLocaleString()}` : 'Loading...'} subValue={priceDistance !== null ? `${priceDistance > 0 ? '+' : ''}${priceDistance.toFixed(2)}% from target` : undefined} icon={TrendingUp} color={isCloseToTrigger ? "from-amber-500 to-orange-600" : "from-emerald-500 to-teal-600"} trend={priceDistance !== null ? (priceDistance > 0 ? 'up' : priceDistance < 0 ? 'down' : 'neutral') : undefined} delay={0.3} />
        <StatCard label="Action" value={rule.action_type.charAt(0).toUpperCase() + rule.action_type.slice(1)} subValue={rule.action_amount_usd ? `$${rule.action_amount_usd}` : `${rule.action_amount_percent}%`} icon={Zap} color="from-amber-500 to-orange-600" delay={0.4} />
      </motion.div>

      {/* Market Analysis Section */}
      {rule.analysis_data && (
        <motion.div 
          variants={itemVariants} 
          className="rounded-2xl bg-gray-900/50 border border-gray-700/40 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-700/40 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/20">
              <Search className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Market Analysis</h2>
              <p className="text-xs text-gray-500">
                Analysis from {rule.analysis_data.analyzed_at 
                  ? format(parseDate(rule.analysis_data.analyzed_at), 'MMM d, yyyy HH:mm')
                  : 'agent deployment'}
              </p>
            </div>
          </div>
          
          <div className="p-5 space-y-4">
            {/* Historical Stats */}
            {rule.analysis_data.historical_stats && (
              <div className="p-4 rounded-xl bg-gray-800/30 border border-gray-700/30">
                <div className="flex items-center gap-2 mb-3">
                  <LineChart className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">7-Day Performance</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Change</p>
                    <p className={`text-sm font-semibold ${
                      (rule.analysis_data.historical_stats.price_change_percent || 0) >= 0 
                        ? 'text-emerald-400' 
                        : 'text-red-400'
                    }`}>
                      {(rule.analysis_data.historical_stats.price_change_percent || 0) >= 0 ? '+' : ''}
                      {rule.analysis_data.historical_stats.price_change_percent?.toFixed(2) || '0'}%
                    </p>
                  </div>
                  {rule.analysis_data.historical_stats.high_price && (
                    <div>
                      <p className="text-xs text-gray-500">High</p>
                      <p className="text-sm font-semibold text-white">
                        ${rule.analysis_data.historical_stats.high_price.toLocaleString()}
                      </p>
                    </div>
                  )}
                  {rule.analysis_data.historical_stats.low_price && (
                    <div>
                      <p className="text-xs text-gray-500">Low</p>
                      <p className="text-sm font-semibold text-white">
                        ${rule.analysis_data.historical_stats.low_price.toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Market Summary */}
            {rule.analysis_data.market_search?.summary && (
              <div className="p-4 rounded-xl bg-gray-800/30 border border-gray-700/30">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="h-4 w-4 text-purple-400" />
                  <span className="text-sm font-medium text-white">Market Summary</span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {rule.analysis_data.market_search.summary}
                </p>
              </div>
            )}

            {/* News */}
            {rule.analysis_data.market_search?.results && rule.analysis_data.market_search.results.length > 0 && (
              <div className="p-4 rounded-xl bg-gray-800/30 border border-gray-700/30">
                <div className="flex items-center gap-2 mb-3">
                  <Newspaper className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-medium text-white">News at Creation</span>
                </div>
                <div className="space-y-2">
                  {rule.analysis_data.market_search.results.map((news: { title?: string; href?: string }, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-xs text-gray-500 mt-0.5">•</span>
                      {news.href ? (
                        <a 
                          href={news.href} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
                        >
                          {news.title || 'News article'}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-300">{news.title || 'News item'}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prediction */}
            {rule.analysis_data.prediction && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                  <span className="text-sm font-medium text-white">AI Assessment</span>
                </div>
                <p className="text-sm text-gray-300">
                  {rule.analysis_data.prediction.replace(/🔮|⚠️/g, '').trim()}
                </p>
              </div>
            )}

            {/* Price at Creation */}
            {rule.analysis_data.current_price && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/20">
                <span className="text-xs text-gray-500">Price at agent deployment</span>
                <span className="text-sm font-mono text-white">
                  ${rule.analysis_data.current_price.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Alert */}
      <AnimatePresence>
        {isCloseToTrigger && rule.status === 'active' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1, repeat: Infinity }}><AlertTriangle className="h-5 w-5 text-amber-400" /></motion.div>
            <div><p className="text-sm font-medium text-amber-400">Price approaching target</p><p className="text-xs text-gray-400">Current price is {Math.abs(priceDistance!).toFixed(2)}% away from target price ${targetPrice.toFixed(2)}</p></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat with Agent */}
      <motion.div variants={itemVariants} className="rounded-2xl bg-gray-900/50 border border-gray-700/40 overflow-hidden">
        <div className="p-5 border-b border-gray-700/40 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/20">
            <MessageSquare className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Agent Assistant</h2>
            <p className="text-xs text-gray-500">Chat to query or modify this agent</p>
          </div>
        </div>
        
        <div className="p-5">
          {/* Chat messages */}
          <div 
            ref={chatContainerRef}
            className="space-y-4 max-h-[300px] overflow-y-auto mb-4 pr-2"
          >
            {chatMessages.length === 0 ? (
              <div className="text-center py-6">
                <Bot className="h-8 w-8 text-gray-500 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Ask me anything about this agent</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {['What is this agent?', 'Pause this agent', 'Change target to $200'].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setChatMessages([{ role: 'user', content: suggestion }])
                        sendChatMessage.mutate(suggestion)
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="p-2 rounded-lg bg-indigo-500/15 h-fit">
                      <Bot className="h-4 w-4 text-indigo-400" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    msg.role === 'user' 
                      ? 'bg-indigo-500/20 text-white' 
                      : 'bg-gray-800/50 text-gray-200'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm">{msg.content}</p>
                    )}
                  </div>
                </motion.div>
              ))
            )}
            {sendChatMessage.isPending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3"
              >
                <div className="p-2 rounded-lg bg-indigo-500/15 h-fit">
                  <Bot className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="bg-gray-800/50 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />
                    <span className="text-sm text-gray-400">Thinking...</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
          
          {/* Chat input */}
          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about this agent or request changes..."
              className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent"
              disabled={sendChatMessage.isPending}
            />
            <motion.button
              type="submit"
              disabled={!chatInput.trim() || sendChatMessage.isPending}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center gap-2"
            >
              {sendChatMessage.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </motion.button>
          </form>
        </div>
      </motion.div>

      {/* Trades */}
      <AnimatePresence>
        {Array.isArray(trades) && trades.length > 0 && (
          <motion.div variants={itemVariants} className="rounded-2xl bg-gray-900/50 border border-gray-700/40 overflow-hidden">
            <div className="p-5 border-b border-gray-700/40 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/20"><CheckCircle className="h-5 w-5 text-emerald-400" /></div>
              <div><h2 className="text-lg font-semibold text-white">Executed Trades</h2><p className="text-xs text-gray-500">{trades.length} trade{trades.length > 1 ? 's' : ''}</p></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800/30"><tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Time</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Side</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Size</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Price</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">TX</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-700/30">
                  {trades.map((trade, idx) => (
                    <motion.tr key={trade.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.1 }} className="hover:bg-gray-800/30">
                      <td className="px-5 py-4"><p className="text-sm text-white">{format(parseDate(trade.executed_at), 'MMM d HH:mm')}</p></td>
                      <td className="px-5 py-4"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${trade.side === 'long' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{trade.side === 'long' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{trade.side.toUpperCase()}</span></td>
                      <td className="px-5 py-4 font-mono text-white">{trade.size}</td>
                      <td className="px-5 py-4 font-mono text-white">${trade.price.toFixed(2)}</td>
                      <td className="px-5 py-4">{trade.tx_signature ? <a href={`https://solscan.io/tx/${trade.tx_signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">View<ExternalLink className="h-3 w-3" /></a> : '-'}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logs */}
      <motion.div variants={itemVariants} className="rounded-2xl bg-gray-900/50 border border-gray-700/40 overflow-hidden">
        <div className="p-5 border-b border-gray-700/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gray-700/30 border border-gray-600/30"><Timer className="h-5 w-5 text-gray-400" /></div>
            <div><h2 className="text-lg font-semibold text-white">Execution Logs</h2><p className="text-xs text-gray-500">Real-time monitoring</p></div>
          </div>
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={() => refetchLogs()} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl"><RefreshCw className="h-4 w-4" /></motion.button>
        </div>
        <div className="p-5">
          {/* Next check countdown for active rules */}
          <NextCheckCountdown isActive={rule.status === 'active'} />
          
          {logsLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="animate-pulse flex gap-4 p-4 rounded-xl bg-gray-800/30"><div className="h-5 w-5 bg-gray-700 rounded-full" /><div className="flex-1 space-y-2"><div className="h-4 bg-gray-700 rounded w-3/4" /><div className="h-3 bg-gray-700 rounded w-1/4" /></div></div>)}</div>
          ) : Array.isArray(logs) && logs.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {logs.slice(0, 20).map((log, idx) => <LogEntry key={log.id} log={log} index={idx} rule={rule} />)}
            </div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-800/50 border border-gray-700/40 flex items-center justify-center"><Clock className="h-8 w-8 text-gray-500" /></div>
              <p className="text-gray-400 font-medium">No logs yet</p>
              <p className="text-sm text-gray-500 mt-1">Logs will appear when the agent is active</p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
