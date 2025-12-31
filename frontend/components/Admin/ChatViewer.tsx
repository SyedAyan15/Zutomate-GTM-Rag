'use client'

import { useState, useEffect } from 'react'
import type { Message } from '@/lib/types'

interface ChatViewerProps {
  chatId: string
}

interface MessageWithUser extends Message {
  profiles?: {
    email: string | null
    username: string | null
  }
}

export default function ChatViewer({ chatId }: ChatViewerProps) {
  const [messages, setMessages] = useState<MessageWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [chatInfo, setChatInfo] = useState<any>(null)

  useEffect(() => {
    if (chatId) {
      loadMessages()
      loadChatInfo()
    }
  }, [chatId])

  const loadChatInfo = async () => {
    try {
      const response = await fetch('/api/admin/chats')
      if (response.ok) {
        const data = await response.json()
        const chat = data.chats.find((c: any) => c.id === chatId)
        if (chat) {
          setChatInfo(chat)
        }
      }
    } catch (error) {
      console.error('Error loading chat info:', error)
    }
  }

  const loadMessages = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/messages?chatId=${chatId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch messages')
      }
      const data = await response.json()
      setMessages(data.messages || [])
    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading messages...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {chatInfo && (
        <div className="border-b border-gray-200 px-6 py-4 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">
            {chatInfo.title || 'Untitled Chat'}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            User: {chatInfo.profiles?.email || chatInfo.profiles?.username || 'Unknown'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Created: {new Date(chatInfo.created_at).toLocaleString()}
          </p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No messages in this chat yet.</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-2xl px-4 py-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-800'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs font-semibold opacity-75">
                      {message.role === 'user'
                        ? chatInfo?.profiles?.email || chatInfo?.profiles?.username || 'User'
                        : 'Assistant'}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <p
                    className={`text-xs mt-2 ${
                      message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                    }`}
                  >
                    {new Date(message.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

