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

  // Simplest working loadMessages - only APPEND new stuff, never replace
  const loadMessages = async (force = false) => {
    if (!chatId) return

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })

    if (error || !data) return

    setMessages((prev) => {
      // 1. Get all IDs we currently know about (including temps)
      const currentIds = new Set(prev.map(m => m.id))

      // 2. Find any messages from server we don't have
      const realNewMessages = data.filter((m: Message) => !currentIds.has(m.id))

      // 3. If nothing new, DO NOT TOUCH STATE. 
      // This protects our temp messages from being wiped by a "complete" but stale list.
      if (realNewMessages.length === 0) return prev

      // 4. If we have new stuff, append it.
      // We also try to replace temp messages if we find their matching pairs
      const nextState = [...prev]

      realNewMessages.forEach((newMsg: Message) => {
        // checks if this new message matches a temp one (same role/content)
        const tempMatchIndex = nextState.findIndex(p =>
          p.id.toString().startsWith('temp-') &&
          p.role === newMsg.role &&
          p.content === newMsg.content
        )

        if (tempMatchIndex !== -1) {
          // Swap temp for real
          nextState[tempMatchIndex] = newMsg
        } else {
          // Just add it
          nextState.push(newMsg)
        }
      })

      return nextState.sort((a: Message, b: Message) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    })
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    // 1. SHOW USER MESSAGE IMMEDIATELY
    const userMsg: Message = {
      id: `temp-user-${crypto.randomUUID()}`,
      chat_id: chatId,
      user_id: user.id,
      content: content.trim(),
      role: 'user',
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const { data: { session } } = await supabase.auth.getSession()

      // 2. CALL API
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : ''
        },
        body: JSON.stringify({
          message: content.trim(),
          chatId: chatId,
          userId: user.id,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to send')

      // 3. SHOW ASSISTANT MESSAGE IMMEDIATELY
      // We force this into state. We do NOT rely on a refresh.
      const assistantMsg: Message = {
        id: `temp-assistant-${crypto.randomUUID()}`,
        chat_id: chatId,
        user_id: user.id,
        content: data.response,
        role: 'assistant',
        created_at: new Date().toISOString(),
      }

      setMessages(prev => [...prev, assistantMsg])

      // 4. OPTIONAL: Trigger title generation silently
      if (chat?.title === 'New Chat') {
        fetch('/api/chat/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content.trim(), chatId }),
        })
          .then(res => res.json())
          .then(d => {
            if (d.title) {
              supabase.from('chats').update({ title: d.title }).eq('id', chatId).then(() => {
                onChatChange(chatId) // Just update title, don't reload messages
              })
            }
          })
          .catch(e => console.error(e))
      }

    } catch (error: any) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        chat_id: chatId,
        user_id: user.id,
        content: 'Error: ' + error.message,
        role: 'assistant',
        created_at: new Date().toISOString()
      }])
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
