import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  MessageSquare, Plus, Trash2, Edit2, Check, X, Activity, Pause, Zap,
  ChevronDown
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
    <div className="w-56 bg-gray-900/80 border-r border-gray-700/30 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-700/30">
        <button
          onClick={() => createConversation.mutate()}
          disabled={createConversation.isPending}
          className="w-full btn-primary py-2 flex items-center justify-center gap-1.5 text-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {/* Agents Summary - Compact */}
      {rules && rules.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-700/30 flex justify-between">
          <div className="flex items-center gap-1 text-emerald-400" title="Active">
            <Activity className="h-3 w-3" />
            <span className="text-xs font-medium">{activeRules}</span>
          </div>
          <div className="flex items-center gap-1 text-indigo-400" title="Executed">
            <Zap className="h-3 w-3" />
            <span className="text-xs font-medium">{triggeredRules}</span>
          </div>
          <div className="flex items-center gap-1 text-amber-400" title="Standby">
            <Pause className="h-3 w-3" />
            <span className="text-xs font-medium">{pausedRules}</span>
          </div>
        </div>
      )}

      {/* Conversations Header */}
      <div className="px-3 py-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium text-gray-500 uppercase">Chats</span>
        {conversations && conversations.length > 0 && (
          <span className="text-[10px] text-gray-600">{conversations.length}</span>
        )}
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-2 space-y-1">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-gray-800/50 rounded animate-pulse" />
            ))}
          </div>
        ) : conversations?.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-xs">
            <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-30" />
            <p>No chats yet</p>
          </div>
        ) : (
          <div className="px-1.5 space-y-0.5">
            {displayedConversations?.map((conv) => (
              <div
                key={conv.id}
                className={`group rounded transition-all cursor-pointer ${
                  selectedConversationId === conv.id
                    ? 'bg-indigo-500/20 border border-indigo-500/30'
                    : 'hover:bg-gray-800/50 border border-transparent'
                }`}
              >
                {editingId === conv.id ? (
                  <div className="p-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave()
                        if (e.key === 'Escape') handleEditCancel()
                      }}
                      className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                      autoFocus
                    />
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={handleEditSave}
                        className="p-0.5 text-emerald-400 hover:text-emerald-300"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        onClick={handleEditCancel}
                        className="p-0.5 text-gray-400 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => onSelectConversation(conv.id)}
                    className="p-2"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs text-white truncate flex-1">
                        {conv.title}
                      </p>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditStart(conv)
                          }}
                          className="p-0.5 text-gray-500 hover:text-white rounded"
                        >
                          <Edit2 className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('Delete this conversation?')) {
                              deleteConversation.mutate(conv.id)
                            }
                          }}
                          className="p-0.5 text-gray-500 hover:text-red-400 rounded"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>

                    {/* Compact stats */}
                    {conv.stats.total_rules > 0 && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {conv.stats.active_rules > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400">
                            <Activity className="h-2 w-2" />
                            {conv.stats.active_rules}
                          </span>
                        )}
                        {conv.stats.triggered_rules > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-400">
                            <Zap className="h-2 w-2" />
                            {conv.stats.triggered_rules}
                          </span>
                        )}
                        {conv.stats.paused_rules > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400">
                            <Pause className="h-2 w-2" />
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
                className="w-full py-1 text-[10px] text-gray-500 hover:text-white flex items-center justify-center gap-0.5 transition-colors"
              >
                <ChevronDown className={`h-2.5 w-2.5 transition-transform ${showAllConversations ? 'rotate-180' : ''}`} />
                {showAllConversations ? 'Less' : `+${conversations.length - 5}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
