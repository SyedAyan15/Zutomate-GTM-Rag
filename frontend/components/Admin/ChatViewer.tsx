'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase/client'
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
  const supabase = createClient()

  useEffect(() => {
    if (chatId) {
      loadMessages()
      loadChatInfo()
    }
  }, [chatId])

  const loadChatInfo = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/admin/chats', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      })
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
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`/api/admin/messages?chatId=${chatId}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      })
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
      <div className="flex items-center justify-center h-full bg-[var(--navy-bg)]">
        <div className="flex space-x-2">
          <div className="w-2 h-2 bg-[var(--orange)] rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-[var(--orange)] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-[var(--orange)] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--navy-bg)]">
      {chatInfo && (
        <div className="border-b border-[var(--border)] px-8 py-6 bg-[var(--navy-card)] shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--white)] tracking-tight">
                {chatInfo.title || 'Untitled Chat'}
              </h2>
              <div className="flex items-center mt-2 space-x-4">
                <p className="text-sm font-medium text-[var(--off)] flex items-center">
                  <span className="w-2 h-2 bg-[var(--orange)] rounded-full mr-2"></span>
                  {chatInfo.profiles?.email || chatInfo.profiles?.username || 'Unknown User'}
                </p>
                <p className="text-xs text-[var(--muted)] font-medium">
                  {new Date(chatInfo.created_at).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="bg-[var(--faint)] px-4 py-2 rounded-xl border border-[var(--border)]">
              <span className="text-[10px] uppercase font-black tracking-widest text-[var(--orange)]">Admin Review Mode</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-[var(--orange)]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--muted)]">
            <div className="text-4xl mb-4 opacity-20">💬</div>
            <p className="font-medium">No messages found in this session</p>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-2xl px-5 py-3 rounded-2xl shadow-sm ${
                    message.role === 'user'
                      ? 'bg-[var(--navy-card)] text-[var(--white)] border-b-2 border-[var(--orange)] rounded-tr-none'
                      : 'bg-[var(--faint)] text-[var(--off)] border border-[var(--border)] rounded-tl-none'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      message.role === 'user' ? 'text-[var(--orange)]' : 'text-[var(--muted)]'
                    }`}>
                      {message.role === 'user' ? 'Customer' : 'Zutomate AI'}
                    </span>
                    <span className="text-[10px] opacity-60 font-medium text-[var(--muted)]">
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
