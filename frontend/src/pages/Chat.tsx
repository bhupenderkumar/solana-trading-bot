import { useState } from 'react'
import ChatSidebar from '../components/ChatSidebar'
import ChatPanel from '../components/ChatPanel'

export default function Chat() {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null)

  const handleConversationCreated = (id: number) => {
    setSelectedConversationId(id)
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] -mx-4 sm:-mx-6 rounded-2xl overflow-hidden border border-gray-700/30">
      {/* Sidebar */}
      <ChatSidebar
        selectedConversationId={selectedConversationId}
        onSelectConversation={setSelectedConversationId}
      />

      {/* Main Chat Area */}
      <div className="flex-1 bg-gray-900/50">
        <ChatPanel
          conversationId={selectedConversationId}
          onConversationCreated={handleConversationCreated}
        />
      </div>
    </div>
  )
}
