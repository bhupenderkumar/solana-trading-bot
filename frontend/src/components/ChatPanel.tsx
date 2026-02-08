import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  Send, Loader2, Sparkles, Bot, User, Activity, Pause, Zap,
  DollarSign, TrendingUp, Wallet, HelpCircle, Target, ArrowRight, RefreshCw
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { rulesApi, chatApi, conversationApi, pricesApi, TradingRule } from '../services/api'
import { useToast } from './Toast'

const QUICK_ACTIONS = [
  { label: 'Prices', icon: TrendingUp, message: 'Show me all prices', color: 'text-success-400' },
  { label: 'Balance', icon: Wallet, message: 'What is my balance?', color: 'text-primary-400' },
  { label: 'My Rules', icon: Target, message: 'Show my rules', color: 'text-warning-400' },
  { label: 'Help', icon: HelpCircle, message: 'Help', color: 'text-dark-300' },
]

const STARTER_CARDS = [
  {
    title: 'Create a Trading Rule',
    description: 'Set up automated trades based on price conditions',
    examples: [
      'If SOL drops below $80, buy $100 worth',
      'When BTC reaches $100k, sell 50%',
    ],
    icon: Target,
    color: 'from-primary-500/20 to-primary-600/10',
  },
  {
    title: 'Check Prices & Balance',
    description: 'Get real-time market data and account info',
    examples: [
      'What is the price of SOL?',
      'Show my balance',
    ],
    icon: TrendingUp,
    color: 'from-success-500/20 to-success-600/10',
  },
  {
    title: 'Analyze Performance',
    description: 'Compare coins and calculate potential profits',
    examples: [
      'Which coin performed best last 7 days?',
      'How much profit if I invested $100 in SOL?',
    ],
    icon: DollarSign,
    color: 'from-warning-500/20 to-warning-600/10',
  },
]

interface ChatPanelProps {
  conversationId: number | null
  onConversationCreated?: (id: number) => void
}

export default function ChatPanel({ conversationId, onConversationCreated }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [localMessages, setLocalMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; intent?: string; ruleCreated?: TradingRule }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const toast = useToast()

  // Fetch prices for ticker
  const { data: prices } = useQuery({
    queryKey: ['prices'],
    queryFn: pricesApi.getAll,
    refetchInterval: 10000,
  })

  // Fetch conversation with messages if conversationId is set
  const { data: conversation, isLoading: isLoadingConversation, refetch: refetchConversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => conversationId ? conversationApi.get(conversationId) : null,
    enabled: !!conversationId,
  })

  // Reset local messages when switching conversations
  useEffect(() => {
    setLocalMessages([])
  }, [conversationId])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages, localMessages])

  const createRule = useMutation({
    mutationFn: (input: string) => rulesApi.createWithConversation(input, conversationId || undefined),
    onSuccess: (newRule) => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
      // Add rule to the last assistant message
      setLocalMessages(prev => {
        const updated = [...prev]
        if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
          updated[updated.length - 1].ruleCreated = newRule
        }
        return updated
      })
      toast.success('Rule created!', newRule.parsed_summary || newRule.user_input)
    },
    onError: (error) => {
      toast.error('Failed to create rule', (error as Error).message)
    },
  })

  const sendChat = useMutation({
    mutationFn: (message: string) => chatApi.sendWithConversation(message, conversationId || undefined),
    onSuccess: (response) => {
      // If a new conversation was created, notify parent
      if (response.conversation_id && !conversationId && onConversationCreated) {
        onConversationCreated(response.conversation_id)
      }

      // Add assistant response to local messages
      setLocalMessages(prev => [...prev, {
        role: 'assistant',
        content: response.response,
        intent: response.intent,
      }])

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      if (conversationId || response.conversation_id) {
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId || response.conversation_id] })
      }

      if (response.should_create_rule && response.original_input) {
        createRule.mutate(response.original_input)
      }
    },
    onError: (error) => {
      toast.error('Failed to send message', (error as Error).message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !isPending) {
      setLocalMessages(prev => [...prev, { role: 'user', content: input }])
      sendChat.mutate(input)
      setInput('')
    }
  }

  const handleQuickAction = (message: string) => {
    setLocalMessages(prev => [...prev, { role: 'user', content: message }])
    sendChat.mutate(message)
    inputRef.current?.focus()
  }

  const isPending = sendChat.isPending || createRule.isPending

  // Combine server messages with local messages
  const allMessages = [
    ...(conversation?.messages || []),
    ...localMessages,
  ]

  // Format price for display
  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    if (price >= 1) return `$${price.toFixed(2)}`
    if (price >= 0.0001) return `$${price.toFixed(4)}`
    return `$${price.toFixed(8)}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Price Ticker */}
      {prices && (
        <div className="border-b border-dark-700 bg-dark-800/80 overflow-hidden">
          <div className="flex items-center gap-6 px-4 py-2 animate-marquee">
            {Object.entries(prices).map(([market, price]) => (
              <div key={market} className="flex items-center gap-2 text-sm whitespace-nowrap">
                <span className="text-dark-400">{market.replace('-PERP', '')}</span>
                <span className="text-white font-medium">{formatPrice(price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversation Header with Stats */}
      {conversation && (
        <div className="p-3 border-b border-dark-700 bg-dark-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-medium text-white truncate max-w-[300px]">{conversation.title}</h3>
              <button 
                onClick={() => refetchConversation()}
                className="p-1 text-dark-400 hover:text-white transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs">
              {conversation.stats.total_rules > 0 && (
                <span className="text-dark-400">{conversation.stats.total_rules} rules</span>
              )}
              {conversation.stats.active_rules > 0 && (
                <div className="flex items-center gap-1 text-success-400" title="Active Rules">
                  <Activity className="h-3 w-3" />
                  <span>{conversation.stats.active_rules} active</span>
                </div>
              )}
              {conversation.stats.triggered_rules > 0 && (
                <div className="flex items-center gap-1 text-primary-400" title="Triggered Rules">
                  <Zap className="h-3 w-3" />
                  <span>{conversation.stats.triggered_rules} triggered</span>
                </div>
              )}
              {conversation.stats.paused_rules > 0 && (
                <div className="flex items-center gap-1 text-warning-400" title="Paused Rules">
                  <Pause className="h-3 w-3" />
                  <span>{conversation.stats.paused_rules} paused</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingConversation ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="p-6 space-y-6">
            {/* Welcome Header */}
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/30 to-primary-600/20 mb-4">
                <Sparkles className="h-8 w-8 text-primary-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Trading Assistant</h2>
              <p className="text-dark-400 max-w-lg mx-auto">
                Create automated trading rules, check prices, or ask anything about your portfolio using natural language.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex justify-center gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.message)}
                  disabled={isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-dark-700/50 hover:bg-dark-700 border border-dark-600 hover:border-dark-500 rounded-lg transition-all text-sm"
                >
                  <action.icon className={`h-4 w-4 ${action.color}`} />
                  <span className="text-dark-200">{action.label}</span>
                </button>
              ))}
            </div>

            {/* Starter Cards */}
            <div className="grid md:grid-cols-3 gap-4 mt-8">
              {STARTER_CARDS.map((card) => (
                <div
                  key={card.title}
                  className={`rounded-xl bg-gradient-to-br ${card.color} border border-dark-600 p-5 hover:border-dark-500 transition-all`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-dark-800/50 rounded-lg">
                      <card.icon className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="font-semibold text-white">{card.title}</h3>
                  </div>
                  <p className="text-sm text-dark-300 mb-4">{card.description}</p>
                  <div className="space-y-2">
                    {card.examples.map((example) => (
                      <button
                        key={example}
                        onClick={() => handleQuickAction(example)}
                        disabled={isPending}
                        className="w-full text-left text-xs bg-dark-800/50 hover:bg-dark-800 px-3 py-2 rounded-lg text-dark-200 hover:text-white transition-all flex items-center justify-between group"
                      >
                        <span className="truncate">{example}</span>
                        <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {allMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 p-2 bg-primary-500/20 rounded-lg h-fit">
                    <Bot className="h-4 w-4 text-primary-400" />
                  </div>
                )}
                <div className="max-w-[80%] space-y-2">
                  <div
                    className={`rounded-xl p-3 ${
                      msg.role === 'user'
                        ? 'bg-primary-500/20 border border-primary-500/30'
                        : 'bg-dark-700/50 border border-dark-600'
                    }`}
                  >
                    {'intent' in msg && msg.intent && msg.intent !== 'general_chat' && (
                      <p className="text-xs text-dark-500 mb-1 uppercase tracking-wide">
                        {msg.intent.replace(/_/g, ' ')}
                      </p>
                    )}
                    <div className="prose prose-invert prose-sm max-w-none text-white
                      prose-headings:text-white prose-headings:font-semibold prose-headings:mt-2 prose-headings:mb-1
                      prose-h3:text-sm prose-h3:text-primary-300
                      prose-p:text-dark-200 prose-p:my-1 prose-p:leading-relaxed
                      prose-strong:text-white prose-strong:font-semibold
                      prose-ul:my-1 prose-ul:pl-3 prose-li:text-dark-200 prose-li:my-0.5
                      prose-ol:my-1 prose-ol:pl-3
                      prose-code:text-primary-300 prose-code:bg-dark-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                      prose-a:text-primary-400 prose-a:no-underline hover:prose-a:underline">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                  
                  {/* Show created rule card */}
                  {'ruleCreated' in msg && msg.ruleCreated && (
                    <Link
                      to={`/rules/${msg.ruleCreated.id}`}
                      className="block bg-success-500/10 border border-success-500/30 rounded-lg p-3 hover:bg-success-500/15 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-success-400 text-sm font-medium mb-1">
                        <Target className="h-4 w-4" />
                        Rule Created
                      </div>
                      <p className="text-sm text-dark-200">{msg.ruleCreated.parsed_summary || msg.ruleCreated.user_input}</p>
                      <p className="text-xs text-dark-400 mt-1">{msg.ruleCreated.market} • Click to view details</p>
                    </Link>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 p-2 bg-dark-700 rounded-lg h-fit">
                    <User className="h-4 w-4 text-dark-300" />
                  </div>
                )}
              </div>
            ))}
            
            {isPending && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 p-2 bg-primary-500/20 rounded-lg h-fit">
                  <Bot className="h-4 w-4 text-primary-400" />
                </div>
                <div className="bg-dark-700/50 border border-dark-600 rounded-xl p-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary-400" />
                  <span className="text-sm text-dark-400">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-dark-700 bg-dark-800/80">
        {/* Quick action chips when in conversation */}
        {allMessages.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action.message)}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700/50 hover:bg-dark-700 border border-dark-600 rounded-full text-xs whitespace-nowrap transition-all"
              >
                <action.icon className={`h-3 w-3 ${action.color}`} />
                <span className="text-dark-300">{action.label}</span>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={allMessages.length === 0 
              ? "Ask anything or create a trading rule..." 
              : "Type your message..."}
            className="flex-1 bg-dark-700 border border-dark-600 rounded-xl px-4 py-3 text-white placeholder-dark-400 focus:outline-none focus:border-primary-500 transition-colors"
            disabled={isPending}
          />
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="btn-primary px-5 py-3 flex items-center gap-2"
          >
            {isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </form>

        {(sendChat.isError || createRule.isError) && (
          <p className="text-danger-400 mt-2 text-sm bg-danger-500/10 border border-danger-500/30 rounded-lg px-3 py-2">
            {(sendChat.error as Error)?.message || (createRule.error as Error)?.message}
          </p>
        )}
      </div>
    </div>
  )
}
