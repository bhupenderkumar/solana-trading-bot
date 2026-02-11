import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  Send, Loader2, Sparkles, Bot, User, Activity, Pause, Zap,
  DollarSign, TrendingUp, Wallet, HelpCircle, Target, RefreshCw
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useWallet } from '@solana/wallet-adapter-react'
import { rulesApi, chatApi, conversationApi, pricesApi, TradingRule } from '../services/api'
import { useToast } from './Toast'

const QUICK_ACTIONS = [
  { label: 'Prices', icon: TrendingUp, message: 'Show me all prices', color: 'text-emerald-400' },
  { label: 'Balance', icon: Wallet, message: 'What is my balance?', color: 'text-indigo-400' },
  { label: 'Agents', icon: Target, message: 'Show my agents', color: 'text-amber-400' },
  { label: 'Help', icon: HelpCircle, message: 'Help', color: 'text-gray-400' },
]

const STARTER_EXAMPLES = [
  { text: 'Buy SOL below $80', icon: Target, color: 'text-indigo-400' },
  { text: 'Sell BTC at $100k', icon: Target, color: 'text-purple-400' },
  { text: 'Price of ETH?', icon: TrendingUp, color: 'text-emerald-400' },
  { text: 'My balance', icon: Wallet, color: 'text-cyan-400' },
  { text: 'Best performer 7d', icon: DollarSign, color: 'text-amber-400' },
  { text: 'Show all agents', icon: Bot, color: 'text-pink-400' },
]

interface ChatPanelProps {
  conversationId: number | null
  onConversationCreated?: (id: number) => void
}

export default function ChatPanel({ conversationId, onConversationCreated }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [localMessages, setLocalMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; intent?: string; ruleCreated?: TradingRule }>>([])
  const [isSending, setIsSending] = useState(false)
  const [chatHighlight, setChatHighlight] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const toast = useToast()
  
  // Get connected wallet address
  const { publicKey } = useWallet()
  const walletAddress = publicKey?.toBase58()

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
    mutationFn: (input: string) => rulesApi.createWithConversation(input, conversationId || undefined, walletAddress),
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
      toast.success('Agent deployed!', newRule.parsed_summary || newRule.user_input)
    },
    onError: (error) => {
      toast.error('Failed to create rule', (error as Error).message)
    },
  })

  const sendChat = useMutation({
    mutationFn: (message: string) => chatApi.sendWithConversation(message, conversationId || undefined, walletAddress),
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

      // Invalidate conversations list (sidebar)
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      
      // Refetch conversation and clear local messages once server has the data
      if (conversationId || response.conversation_id) {
        const convId = conversationId || response.conversation_id
        // Refetch and clear local messages after server data is loaded
        queryClient.refetchQueries({ queryKey: ['conversation', convId] }).then(() => {
          setLocalMessages([])
        })
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
      setIsSending(true)
      setChatHighlight(true)
      setLocalMessages(prev => [...prev, { role: 'user', content: input }])
      sendChat.mutate(input)
      setInput('')
      // Reset animation states
      setTimeout(() => {
        setIsSending(false)
        setChatHighlight(false)
      }, 600)
    }
  }

  const handleQuickAction = (message: string) => {
    setIsSending(true)
    setChatHighlight(true)
    setLocalMessages(prev => [...prev, { role: 'user', content: message }])
    sendChat.mutate(message)
    inputRef.current?.focus()
    // Reset animation states
    setTimeout(() => {
      setIsSending(false)
      setChatHighlight(false)
    }, 600)
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
      {/* Compact Price Ticker */}
      {prices && typeof prices === 'object' && (
        <div className="border-b border-gray-700/30 bg-gray-900/50 overflow-hidden">
          <div className="flex items-center gap-4 px-3 py-1.5 animate-marquee">
            {Object.entries(prices).map(([market, price]) => (
              <div key={market} className="flex items-center gap-1 text-xs whitespace-nowrap">
                <span className="text-gray-500">{market.replace('-PERP', '')}</span>
                <span className="text-white">{formatPrice(price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversation Header with Stats */}
      {conversation && (
        <div className="px-4 py-2 border-b border-gray-700/30 bg-gray-900/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm text-white truncate max-w-[200px]">{conversation.title}</h3>
              <button 
                onClick={() => refetchConversation()}
                className="p-1 text-gray-500 hover:text-white transition-all hover:bg-white/5 rounded"
                title="Refresh"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              {conversation.stats.active_rules > 0 && (
                <div className="flex items-center gap-1 text-emerald-400" title="Active">
                  <Activity className="h-2.5 w-2.5" />
                  <span>{conversation.stats.active_rules}</span>
                </div>
              )}
              {conversation.stats.triggered_rules > 0 && (
                <div className="flex items-center gap-1 text-indigo-400" title="Executed">
                  <Zap className="h-2.5 w-2.5" />
                  <span>{conversation.stats.triggered_rules}</span>
                </div>
              )}
              {conversation.stats.paused_rules > 0 && (
                <div className="flex items-center gap-1 text-amber-400" title="Standby">
                  <Pause className="h-2.5 w-2.5" />
                  <span>{conversation.stats.paused_rules}</span>
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
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="p-4 space-y-4">
            {/* Compact Welcome */}
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/20 mb-3">
                <Sparkles className="h-6 w-6 text-indigo-400" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-1">Agent Console</h2>
              <p className="text-xs text-gray-500">Deploy agents, check prices, manage your portfolio</p>
            </div>

            {/* Icon-only Quick Actions */}
            <div className="flex justify-center gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.message)}
                  disabled={isPending}
                  title={action.label}
                  className="p-2.5 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/30 hover:border-gray-600/50 rounded-lg transition-all"
                >
                  <action.icon className={`h-4 w-4 ${action.color}`} />
                </button>
              ))}
            </div>

            {/* Compact Example Grid */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              {STARTER_EXAMPLES.map((example) => (
                <button
                  key={example.text}
                  onClick={() => handleQuickAction(example.text)}
                  disabled={isPending}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800/30 hover:bg-gray-700/40 border border-gray-700/20 hover:border-gray-600/40 rounded-lg transition-all text-left group"
                >
                  <example.icon className={`h-3 w-3 ${example.color} flex-shrink-0`} />
                  <span className="text-xs text-gray-400 group-hover:text-white truncate">{example.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={`p-3 space-y-3 ${chatHighlight ? 'chat-highlight' : ''}`}>
            {allMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end message-enter-user' : 'message-enter-assistant'}`}
                style={{ animationDelay: `${Math.min(idx * 0.05, 0.3)}s` }}
              >
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 p-2 bg-indigo-500/15 rounded-lg h-fit border border-indigo-500/20">
                    <Bot className="h-3.5 w-3.5 text-indigo-400" />
                  </div>
                )}
                <div className="max-w-[80%] space-y-1.5">
                  <div
                    className={`rounded-xl px-3 py-2 text-sm message-bubble ${
                      msg.role === 'user'
                        ? 'bg-indigo-500/15 border border-indigo-500/20 message-bubble-user'
                        : 'bg-gray-800/50 border border-gray-700/30 message-bubble-assistant'
                    }`}
                  >
                    {'intent' in msg && msg.intent && msg.intent !== 'general_chat' && (
                      <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">
                        {msg.intent.replace(/_/g, ' ')}
                      </p>
                    )}
                    <div className="markdown-content text-sm">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                  
                  {/* Show created rule card */}
                  {'ruleCreated' in msg && msg.ruleCreated && (
                    <Link
                      to={`/rules/${msg.ruleCreated.id}`}
                      className="block bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 hover:bg-emerald-500/15 transition-all"
                    >
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium mb-1">
                        <Target className="h-3 w-3" />
                        Agent Deployed
                      </div>
                      <p className="text-xs text-gray-300">{msg.ruleCreated.parsed_summary || msg.ruleCreated.user_input}</p>
                    </Link>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 p-2 bg-gray-700/50 rounded-lg h-fit border border-gray-700/30">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                )}
              </div>
            ))}
            
            {isPending && (
              <div className="flex gap-2 message-enter">
                <div className="flex-shrink-0 p-2 bg-indigo-500/15 rounded-lg h-fit border border-indigo-500/20">
                  <Bot className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <div className="bg-gray-800/50 border border-gray-700/30 rounded-xl px-3 py-2">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-gray-700/30 bg-gray-900/50">
        {/* Quick action chips when in conversation */}
        {allMessages.length > 0 && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 scrollbar-thin">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action.message)}
                disabled={isPending}
                title={action.label}
                className="p-1.5 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/30 rounded transition-all"
              >
                <action.icon className={`h-3 w-3 ${action.color}`} />
              </button>
            ))}
          </div>
        )}

        <div className={`chat-input-wrapper ${isSending ? 'is-sending' : ''}`}>
          <form onSubmit={handleSubmit} className="chat-input-inner flex gap-2 p-1.5">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={allMessages.length === 0 
                ? "Deploy agent, check prices..." 
                : "Message..."}
              className="flex-1 bg-transparent border-0 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-0"
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={isPending || !input.trim()}
              className={`send-button btn-primary px-4 py-2 flex items-center ${isSending ? 'is-sending' : ''}`}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        </div>

        {(sendChat.isError || createRule.isError) && (
          <p className="text-red-400 mt-2 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {(sendChat.error as Error)?.message || (createRule.error as Error)?.message}
          </p>
        )}
      </div>
    </div>
  )
}
