'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../lib/supabase/client'
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

  const loadMessages = async (force = false) => {
    if (!chatId) return

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setMessages((prev) => {
        // ROBUST MERGE STRATEGY
        // Source of Truth 1: 'data' (Official DB messages)
        // Source of Truth 2: 'prev' (Local optimistic messages)

        const dbMessages = data;

        // Find optimistic messages in local state that are NOT yet in the DB fetch
        // We match by content/role because IDs won't match (UUID vs temp-*)
        const pendingMessages = prev.filter(p => {
          // Only care about keeping temp messages
          if (!p.id.toString().startsWith('temp-')) return false;

          // Check if this temp message is already represented in the DB fetch
          const isCovered = dbMessages.some((db: Message) =>
            db.role === p.role &&
            db.content === p.content
          );

          // If NOT covered, we must keep it (it's still pending)
          return !isCovered;
        });

        // Combine and Sort
        const combined = [...dbMessages, ...pendingMessages].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        return combined;
      })
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
        (payload: { new: Message }) => {
          const newMessage = payload.new
          setMessages((prev) => {
            // 1. Check if ID already exists
            if (prev.some(m => m.id === newMessage.id)) return prev

            // 2. Check for matching content/role (optimistic peer)
            // If we find a message with same role and content created very recently, 
            // it's probably our optimistic UI message being "confirmed" by the DB.
            const duplicateIndex = prev.findIndex(m =>
              m.role === newMessage.role &&
              m.content === newMessage.content &&
              m.id.startsWith('temp-')
            )

            if (duplicateIndex !== -1) {
              const newMessages = [...prev]
              newMessages[duplicateIndex] = newMessage
              return newMessages
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
    const tempId = `temp-user-${crypto.randomUUID()}`
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

      // Add assistant message directly to state for instant feedback
      const assistantMessage: Message = {
        id: `temp-assistant-${crypto.randomUUID()}`,
        chat_id: chatId,
        user_id: user.id,
        content: data.response,
        role: 'assistant',
        created_at: new Date().toISOString(),
      }

      setMessages((prev) => {
        // Double check we don't already have it
        if (prev.some(m => m.content === data.response && m.role === 'assistant')) return prev
        return [...prev, assistantMessage]
      })
      console.log('✅ Assistant message pushed to state')

      // 3. Failsafe re-sync after a short delay
      setTimeout(async () => {
        const { data: freshDocs } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: true })

        if (freshDocs) {
          setMessages(prev => {
            // Find messages from server that aren't in our current list (by ID)
            const currentIds = new Set(prev.map((m: Message) => m.id))
            const newFromServer = freshDocs.filter((m: Message) => !currentIds.has(m.id))

            if (newFromServer.length === 0) return prev

            // Replace temp messages with server ones if they match
            return prev.map((m: Message) => {
              if (m.id.toString().startsWith('temp-')) {
                const match = freshDocs.find((fs: Message) => fs.role === m.role && fs.content === m.content)
                return match || m
              }
              return m
            })
          })
        }
      }, 1500)

      // 4. Generate Title if this is the first message
      if (chat?.title === 'New Chat') {
        try {
          const titleRes = await fetch('/api/chat/title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: content.trim(), chatId }),
          })
          const titleData = await titleRes.json()

          if (titleData.title) {
            await (supabase.from('chats') as any).update({ title: titleData.title }).eq('id', chatId)
            onChatChange(chatId)
          }
        } catch (err) {
          console.error('Title gen failed', err)
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
