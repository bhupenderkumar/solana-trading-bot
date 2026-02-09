import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  MessageSquare, Plus, Trash2, Edit2, Check, X, Activity, Pause, Zap,
  ChevronDown, Target, Clock
} from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { conversationApi, Conversation, rulesApi } from '../services/api'
import { useToast } from './Toast'

interface ChatSidebarProps {
  selectedConversationId: number | null
  onSelectConversation: (id: number | null) => void
}

export default function ChatSidebar({ selectedConversationId, onSelectConversation }: ChatSidebarProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [showAllConversations, setShowAllConversations] = useState(false)
  const queryClient = useQueryClient()
  const toast = useToast()
  
  // Get connected wallet address
  const { publicKey } = useWallet()
  const walletAddress = publicKey?.toBase58()

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations', walletAddress],
    queryFn: () => conversationApi.list(walletAddress),
    refetchInterval: 30000,
  })

  // Get rules summary filtered by wallet
  const { data: rules } = useQuery({
    queryKey: ['rules', walletAddress],
    queryFn: () => rulesApi.list(undefined, walletAddress),
    refetchInterval: 30000,
  })

  const createConversation = useMutation({
    mutationFn: () => conversationApi.create(undefined, walletAddress),
    onSuccess: (newConversation) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      onSelectConversation(newConversation.id)
      toast.success('New conversation created')
    },
    onError: (error) => {
      toast.error('Failed to create conversation', (error as Error).message)
    },
  })

  const updateConversation = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => 
      conversationApi.update(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setEditingId(null)
      toast.success('Conversation renamed')
    },
    onError: (error) => {
      toast.error('Failed to update conversation', (error as Error).message)
    },
  })

  const deleteConversation = useMutation({
    mutationFn: conversationApi.delete,
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      if (selectedConversationId === deletedId) {
        onSelectConversation(null)
      }
      toast.success('Conversation deleted')
    },
    onError: (error) => {
      toast.error('Failed to delete conversation', (error as Error).message)
    },
  })

  const handleEditStart = (conv: Conversation) => {
    setEditingId(conv.id)
    setEditTitle(conv.title)
  }

  const handleEditSave = () => {
    if (editingId && editTitle.trim()) {
      updateConversation.mutate({ id: editingId, title: editTitle.trim() })
    }
  }

  const handleEditCancel = () => {
    setEditingId(null)
    setEditTitle('')
  }

  // Calculate rule stats
  const activeRules = rules?.filter(r => r.status === 'active').length || 0
  const triggeredRules = rules?.filter(r => r.status === 'triggered').length || 0
  const pausedRules = rules?.filter(r => r.status === 'paused').length || 0

  // Show only recent conversations or all
  const displayedConversations = showAllConversations 
    ? conversations 
    : conversations?.slice(0, 5)

  return (
    <div className="w-72 bg-gray-900/80 border-r border-gray-700/30 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-700/30">
        <button
          onClick={() => createConversation.mutate()}
          disabled={createConversation.isPending}
          className="w-full btn-primary py-2.5 flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Rules Summary */}
      {rules && rules.length > 0 && (
        <div className="p-3 border-b border-gray-700/30 bg-gray-900/50">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-indigo-400" />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Rules Summary</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-emerald-400">
                <Activity className="h-3 w-3" />
                <span className="font-semibold">{activeRules}</span>
              </div>
              <span className="text-xs text-gray-500">Active</span>
            </div>
            <div className="text-center p-2 bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-indigo-400">
                <Zap className="h-3 w-3" />
                <span className="font-semibold">{triggeredRules}</span>
              </div>
              <span className="text-xs text-gray-500">Triggered</span>
            </div>
            <div className="text-center p-2 bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-amber-400">
                <Pause className="h-3 w-3" />
                <span className="font-semibold">{pausedRules}</span>
              </div>
              <span className="text-xs text-gray-500">Paused</span>
            </div>
          </div>
        </div>
      )}

      {/* Conversations Header */}
      <div className="px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Recent Chats</span>
        {conversations && conversations.length > 0 && (
          <span className="text-xs text-gray-500">{conversations.length}</span>
        )}
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : conversations?.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">No conversations yet</p>
            <p className="text-xs text-gray-500">Start a new chat to begin trading</p>
          </div>
        ) : (
          <div className="px-2 space-y-1">
            {displayedConversations?.map((conv) => (
              <div
                key={conv.id}
                className={`group rounded-lg transition-all cursor-pointer ${
                  selectedConversationId === conv.id
                    ? 'bg-indigo-500/20 border border-indigo-500/30'
                    : 'hover:bg-gray-800/50 border border-transparent'
                }`}
              >
                {editingId === conv.id ? (
                  <div className="p-3">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave()
                        if (e.key === 'Escape') handleEditCancel()
                      }}
                      className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
                      autoFocus
                    />
                    <div className="flex gap-1 mt-2">
                      <button
                        onClick={handleEditSave}
                        className="p-1 text-emerald-400 hover:text-emerald-300"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={handleEditCancel}
                        className="p-1 text-gray-400 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => onSelectConversation(conv.id)}
                    className="p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {conv.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3 text-gray-500" />
                          <p className="text-xs text-gray-500">
                            {new Date(conv.updated_at || conv.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditStart(conv)
                          }}
                          className="p-1 text-gray-400 hover:text-white rounded"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('Delete this conversation?')) {
                              deleteConversation.mutate(conv.id)
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-red-400 rounded"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Stats badges */}
                    {conv.stats.total_rules > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        {conv.stats.active_rules > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                            <Activity className="h-2.5 w-2.5" />
                            {conv.stats.active_rules}
                          </span>
                        )}
                        {conv.stats.triggered_rules > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded">
                            <Zap className="h-2.5 w-2.5" />
                            {conv.stats.triggered_rules}
                          </span>
                        )}
                        {conv.stats.paused_rules > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                            <Pause className="h-2.5 w-2.5" />
                            {conv.stats.paused_rules}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Show more button */}
            {conversations && conversations.length > 5 && (
              <button
                onClick={() => setShowAllConversations(!showAllConversations)}
                className="w-full p-2 text-xs text-gray-400 hover:text-white flex items-center justify-center gap-1 transition-colors"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${showAllConversations ? 'rotate-180' : ''}`} />
                {showAllConversations ? 'Show less' : `Show ${conversations.length - 5} more`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-700/30 text-center">
        <p className="text-xs text-gray-500">
          Powered by AI
        </p>
      </div>
    </div>
  )
}
