import { useState } from 'react'
import ChatSidebar from '../components/ChatSidebar'
import ChatPanel from '../components/ChatPanel'

export default function Chat() {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null)

  const handleConversationCreated = (id: number) => {
    setSelectedConversationId(id)
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6 -mt-2">
      {/* Sidebar */}
      <ChatSidebar
        selectedConversationId={selectedConversationId}
        onSelectConversation={setSelectedConversationId}
      />

      {/* Main Chat Area */}
      <div className="flex-1 bg-dark-900">
        <ChatPanel
          conversationId={selectedConversationId}
          onConversationCreated={handleConversationCreated}
        />
      </div>
    </div>
  )
}
