'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import type { Chat, Message } from '@/lib/types'

interface ChatInterfaceProps {
  chatId: string | null
  onChatChange: (chatId: string | null) => void
}

export default function ChatInterface({ chatId, onChatChange }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [chat, setChat] = useState<Chat | null>(null)
  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatId) {
      loadChat()
      loadMessages()
      subscribeToMessages()
    } else {
      setMessages([])
      setChat(null)
    }

    return () => {
      if (chatId) {
        supabase
          .channel(`messages:${chatId}`)
          .unsubscribe()
      }
    }
  }, [chatId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadChat = async () => {
    if (!chatId) return

    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single()

    if (!error && data) {
      setChat(data)
    }
  }

  const loadMessages = async () => {
    if (!chatId) return

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setMessages(data)
    }
  }

  const subscribeToMessages = () => {
    if (!chatId) return

    const channel = supabase
      .channel(`messages:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message
          setMessages((prev) => {
            // Prevent duplicates if we already added it optimistically
            if (prev.some(m => m.id === newMessage.id)) {
              return prev
            }
            return [...prev, newMessage]
          })
        }
      )
      .subscribe()
  }

  const handleSendMessage = async (content: string) => {
    if (!chatId || !content.trim()) return

    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      return
    }

    // Create optimistic message
    const tempId = crypto.randomUUID()
    const optimisticMessage: Message = {
      id: tempId,
      chat_id: chatId,
      user_id: user.id,
      content: content.trim(),
      role: 'user',
      created_at: new Date().toISOString(),
    }

    // Update UI immediately
    setMessages((prev) => [...prev, optimisticMessage])

    // Send to RAG API
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          message: content.trim(),
          chatId: chatId,
          userId: user.id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to get response from RAG API')
      }

      // Generate Title if this is the first message
      if (chat?.title === 'New Chat') {
        try {
          const titleRes = await fetch('/api/chat/title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: content.trim(), chatId }),
          })
          const titleData = await titleRes.json()

          if (titleData.title) {
            const { error: titleUpdateError } = await (supabase
              .from('chats') as any)
              .update({ title: titleData.title })
              .eq('id', chatId)

            if (!titleUpdateError) {
              onChatChange(chatId)
            }
          }
        } catch (titleErr) {
          console.error('Title gen error:', titleErr)
        }
      }

    } catch (error: any) {
      console.error('Error calling RAG API:', error)
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        chat_id: chatId,
        user_id: user.id,
        content: 'Sorry, there was an error processing your message. Please try again.',
        role: 'assistant',
        created_at: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, errorMessage])

      await supabase.from('messages').insert({
        id: errorMessage.id,
        chat_id: chatId,
        user_id: user.id,
        content: errorMessage.content,
        role: 'assistant',
      } as any)
    } finally {
      setLoading(false)
    }
  }

  const handleNewChat = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        title: 'New Chat',
      } as any)
      .select()
      .single()

    if (!error && data) {
      onChatChange((data as any).id)
    }
  }

  if (!chatId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0A192F] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A192F] to-[#112240] opacity-90"></div>
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-500"></div>
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-orange-500 rounded-full blur-[100px] opacity-10"></div>

        <div className="relative z-10 text-center max-w-lg px-6">
          <h1 className="text-4xl font-bold mb-4 tracking-tight text-orange-500">
            Zutomate
          </h1>
          <div className="w-24 h-1 bg-orange-500 mx-auto mb-6 rounded-full"></div>
          <h2 className="text-2xl font-light text-white mb-8 italic">
            "Your First Go-to Market AI Agent"
          </h2>
          <button
            onClick={handleNewChat}
            className="px-8 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl hover:from-orange-600 hover:to-amber-600 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all shadow-xl shadow-orange-500/20 transform hover:-translate-y-1"
          >
            Start New Conversation
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <MessageList messages={messages} loading={loading} />
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="max-w-4xl w-full mx-auto px-4 pb-4">
        <MessageInput onSendMessage={handleSendMessage} disabled={loading} />
      </div>
    </div>
  )
}
