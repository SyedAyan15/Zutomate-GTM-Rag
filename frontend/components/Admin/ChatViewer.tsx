'use client'

import { useState, useEffect } from 'react'
import type { Message } from '../../lib/types'

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
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="flex space-x-2">
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {chatInfo && (
        <div className="border-b border-gray-100 px-8 py-6 bg-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">
                {chatInfo.title || 'Untitled Chat'}
              </h2>
              <div className="flex items-center mt-2 space-x-4">
                <p className="text-sm font-medium text-gray-600 flex items-center">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                  {chatInfo.profiles?.email || chatInfo.profiles?.username || 'Unknown User'}
                </p>
                <p className="text-xs text-gray-400 font-medium">
                  {new Date(chatInfo.created_at).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="bg-[#0A192F]/5 px-4 py-2 rounded-xl border border-[#0A192F]/10">
              <span className="text-[10px] uppercase font-black tracking-widest text-[#0A192F]">Admin Review Mode</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-gray-200">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="text-4xl mb-4 opacity-20">💬</div>
            <p className="font-medium">No messages found in this session</p>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
              >
                <div
                  className={`max-w-2xl px-5 py-3 rounded-2xl shadow-sm ${message.role === 'user'
                    ? 'bg-[#0A192F] text-white border-b-2 border-orange-500 rounded-tr-none'
                    : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                    }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${message.role === 'user' ? 'text-orange-300' : 'text-gray-400'
                      }`}>
                      {message.role === 'user' ? 'Customer' : 'Zutomate AI'}
                    </span>
                    <span className={`text-[10px] opacity-60 font-medium ${message.role === 'user' ? 'text-white' : 'text-gray-400'
                      }`}>
                      {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

