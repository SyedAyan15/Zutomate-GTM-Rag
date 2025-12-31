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

    if (!user) return

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

    // Save user message to DB
    const { data: userMessage, error: userError } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        user_id: user.id,
        content: content.trim(),
        role: 'user',
      } as any)
      .select()
      .single()

    if (userError) {
      console.error('Error saving user message:', userError)
      // Rollback optimistic update
      setMessages((prev) => prev.filter(m => m.id !== tempId))
      setLoading(false)
      return
    }

    // Replace temp ID with real ID in state (if needed, though subscription might handle it)
    // Actually, simpler to just let subscription handle the real insert or ignore if duplicate.
    // Ensure we update the ID so the deduper works if the subscription event comes late.
    setMessages((prev) => prev.map(m => m.id === tempId ? userMessage : m))

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

      const assistantContent = data.response || 'Sorry, I could not process your request.'

      // Create assistant message object
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        chat_id: chatId,
        user_id: user.id,
        content: assistantContent,
        role: 'assistant',
        created_at: new Date().toISOString(),
      }

      // Update UI immediately for assistant message
      setMessages((prev) => [...prev, assistantMessage])

      // Save assistant message to DB (background)
      supabase.from('messages').insert({
        id: assistantMessage.id, // Use same ID to prevent subscription duplicates
        chat_id: chatId,
        user_id: user.id,
        content: assistantContent,
        role: 'assistant',
      } as any).then(({ error }) => {
        if (error) console.error('Error saving assistant message:', error)
      })

      // Generate Title if this is the first message (or messages was empty before optimistic update)
      // We check if messages.length is 1 (our optimistic one) or if current chat title is 'New Chat'
      // Ideally we check chat title.
      if (chat?.title === 'New Chat') {
        try {
          const titleRes = await fetch('/api/chat/title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: content.trim(), chatId }),
          })
          const titleData = await titleRes.json()

          if (titleData.title) {
            // Update title in Supabase
            const { error: titleUpdateError } = await (supabase
              .from('chats') as any)
              .update({ title: titleData.title })
              .eq('id', chatId)

            if (!titleUpdateError) {
              onChatChange(chatId) // Refresh sidebar
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

      // Show error immediately in UI
      setMessages((prev) => [...prev, errorMessage])

      // Save error message to DB
      await supabase.from('messages').insert({
        id: errorMessage.id,
        chat_id: chatId,
        user_id: user.id,
        content: errorMessage.content,
        role: 'assistant',
      } as any)
    }

    setLoading(false)
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
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">
            Welcome to Zutomate
          </h2>
          <button
            onClick={handleNewChat}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Start New Chat
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto p-4">
        <MessageList messages={messages} loading={loading} />
        <div ref={messagesEndRef} />
      </div>
      <MessageInput onSendMessage={handleSendMessage} disabled={loading} />
    </div>
  )
}

