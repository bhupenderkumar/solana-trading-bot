import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, Sparkles, ChevronDown, Bot, MessageSquare } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { rulesApi, chatApi, ChatResponse } from '../services/api'
import { useToast } from './Toast'

const EXAMPLE_RULES = [
  {
    category: 'Price Drops',
    examples: [
      'If SOL-PERP drops $5, sell everything',
      'When SOL falls below $150, close my position',
      'If BTC-PERP drops 5%, sell 50% of my position',
    ]
  },
  {
    category: 'Price Targets',
    examples: [
      'When BTC-PERP reaches $100k, take 50% profit',
      'If ETH goes above $4000, sell 25%',
      'When SOL hits $200, close half my position',
    ]
  },
  {
    category: 'Buy Orders',
    examples: [
      'If ETH goes below $3000, buy $500 worth',
      'When BTC dips to $90k, buy 0.1 BTC',
      'If SOL drops to $100, buy $1000 worth',
    ]
  },
  {
    category: 'Questions',
    examples: [
      'What is my balance?',
      'What is the price of SOL?',
      'Show me BTC price',
    ]
  },
]

export default function RuleInput() {
  const [input, setInput] = useState('')
  const [showExamples, setShowExamples] = useState(false)
  const [chatResponse, setChatResponse] = useState<ChatResponse | null>(null)
  const queryClient = useQueryClient()
  const toast = useToast()

  const createRule = useMutation({
    mutationFn: rulesApi.create,
    onSuccess: (newRule) => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      setInput('')
      setChatResponse(null)
      toast.success('Rule created!', newRule.parsed_summary || newRule.user_input)
    },
    onError: (error) => {
      toast.error('Failed to create rule', (error as Error).message)
    },
  })

  const sendChat = useMutation({
    mutationFn: chatApi.send,
    onSuccess: (response) => {
      setChatResponse(response)
      if (response.should_create_rule && response.original_input) {
        // It's a trading rule, create it
        createRule.mutate(response.original_input)
      } else {
        // It's a chat response, show it to the user
        setInput('')
      }
    },
    onError: (error) => {
      toast.error('Failed to send message', (error as Error).message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim()) {
      setChatResponse(null)
      sendChat.mutate(input)
    }
  }

  const isPending = sendChat.isPending || createRule.isPending

  return (
    <div className="card bg-gradient-to-br from-dark-800 to-dark-800/50 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary-400" />
        <h2 className="text-lg font-semibold text-white">Trading Assistant</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about prices, balance, or create a trading rule..."
              className="input-lg"
              disabled={isPending}
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-white text-sm transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="btn-primary px-6 py-3.5"
          >
            {isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
            Send
          </button>
        </div>

        {(sendChat.isError || createRule.isError) && (
          <p className="text-danger-400 mt-3 text-sm bg-danger-500/10 border border-danger-500/30 rounded-xl px-3 py-2">
            {(sendChat.error as Error)?.message || (createRule.error as Error)?.message}
          </p>
        )}
      </form>

      {/* Chat Response */}
      {chatResponse && !chatResponse.should_create_rule && (
        <div className="mt-4 p-4 bg-dark-700/50 border border-dark-600 rounded-xl animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary-500/20 rounded-lg">
              <Bot className="h-5 w-5 text-primary-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-dark-400 mb-1 flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {chatResponse.intent.replace('_', ' ')}
              </p>
              <div className="prose prose-invert prose-sm max-w-none text-white
                prose-headings:text-white prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                prose-h3:text-base prose-h3:text-primary-300
                prose-p:text-dark-200 prose-p:my-2 prose-p:leading-relaxed
                prose-strong:text-white prose-strong:font-semibold
                prose-ul:my-2 prose-ul:pl-4 prose-li:text-dark-200 prose-li:my-1
                prose-ol:my-2 prose-ol:pl-4
                prose-code:text-primary-300 prose-code:bg-dark-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                prose-a:text-primary-400 prose-a:no-underline hover:prose-a:underline">
                <ReactMarkdown>{chatResponse.response}</ReactMarkdown>
              </div>
            </div>
            <button
              onClick={() => setChatResponse(null)}
              className="text-dark-500 hover:text-white text-sm transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Examples */}
      <div className="mt-4">
        <button
          onClick={() => setShowExamples(!showExamples)}
          className="flex items-center gap-2 text-sm text-dark-400 hover:text-white transition-colors"
        >
          <span>Example rules</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showExamples ? 'rotate-180' : ''}`} />
        </button>

        {showExamples && (
          <div className="mt-3 space-y-4 animate-fade-in">
            {EXAMPLE_RULES.map(category => (
              <div key={category.category}>
                <p className="text-xs text-dark-500 uppercase tracking-wide mb-2 font-medium">{category.category}</p>
                <div className="flex flex-wrap gap-2">
                  {category.examples.map(example => (
                    <button
                      key={example}
                      onClick={() => setInput(example)}
                      className="text-xs bg-dark-700/50 hover:bg-dark-700 border border-dark-600 hover:border-dark-500 px-3 py-1.5 rounded-lg transition-all text-dark-300 hover:text-white"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
