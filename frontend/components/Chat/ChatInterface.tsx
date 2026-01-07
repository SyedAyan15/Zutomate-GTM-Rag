'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../lib/supabase/client'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import type { Chat, Message } from '@/lib/types'

interface ChatInterfaceProps {
  chatId: string | null
  onChatChange: (chatId: string | null) => void
  isAdmin?: boolean
}

export default function ChatInterface({ chatId, onChatChange, isAdmin = false }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [chat, setChat] = useState<Chat | null>(null)
  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatId) {
      // 1. Immediate reset to prevent "stuck" view of old chat
      setMessages([])
      setChat(null)
      setLoading(true)

      // 2. Load new data
      Promise.all([loadChat(), loadMessages()])
        .finally(() => setLoading(false))

      let channel: any = null
      if (!isAdmin) {
        channel = subscribeToMessages()
      }

      return () => {
        if (channel) supabase.removeChannel(channel)
      }
    } else {
      setMessages([])
      setChat(null)
    }
  }, [chatId, isAdmin])

  // Removed separate scrollToBottom effect to avoid fighting with scroll position during load
  // Added specific scroll behavior in loadMessages instead

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

    let data: Message[] | null = null
    let error: any = null

    if (isAdmin) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/admin/messages?chatId=${chatId}`, {
          headers: {
            Authorization: `Bearer ${session?.access_token}`
          }
        })
        if (res.ok) {
          const json = await res.json()
          data = json.messages
        } else {
          console.error('Admin Fetch Error:', await res.json())
        }
      } catch (e) {
        console.error('Admin Fetch Exception:', e)
      }
    } else {
      const result = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })
      data = result.data
      error = result.error
    }

    if (error || !data) return

    setMessages((prev) => {
      // Start with the authoritative server data
      const nextState: Message[] = [...data]

      // OPTIMIZATION: merge valid local temp messages that haven't synced yet
      if (prev.length > 0) {
        prev.forEach(oldMsg => {
          if (!oldMsg.id.toString().startsWith('temp-')) return

          // Check if matches a new real message
          const hasRealCounterpart = nextState.some(newMsg =>
            newMsg.role === oldMsg.role &&
            newMsg.content === oldMsg.content
          )

          if (!hasRealCounterpart) {
            nextState.push(oldMsg)
          }
        })
      }

      return nextState.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    })

    // Scroll to bottom after loading messages
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 100)
  }

  const subscribeToMessages = () => {
    if (!chatId) return null

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

            // Double check content uniqueness to avoid "double vision" if ID differs
            const contentExists = prev.some(m =>
              m.content === newMessage.content &&
              m.role === newMessage.role
            )
            if (contentExists) return prev

            return [...prev, newMessage]
          })
          // Scroll on new message
          setTimeout(scrollToBottom, 100)
        }
      )
      .subscribe()

    return channel
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
      console.log('DEBUG: API Response', data)
      if (!response.ok) throw new Error(data.error || 'Failed to send')

      // 3. SHOW ASSISTANT MESSAGE IMMEDIATELY
      // Use fallback fields if response format varies
      const assistantContent = data.response || data.answer || data.message || ''

      if (!assistantContent) {
        console.warn('DEBUG: No content found in response', data)
        return // Don't add empty message
      }

      const assistantMsg: Message = {
        id: `temp-assistant-${crypto.randomUUID()}`,
        chat_id: chatId,
        user_id: user.id,
        content: assistantContent,
        role: 'assistant',
        created_at: new Date().toISOString(),
      }

      // Remove any existing temp assistant messages before adding new one
      setMessages(prev => {
        const filtered = prev.filter(m => !m.id.startsWith('temp-assistant-'))
        const updated = [...filtered, assistantMsg]
        console.log('Assistant message added:', assistantMsg)
        return updated
      })

      setTimeout(scrollToBottom, 0)

      // Remove manual reload to prevent race condition with Realtime subscription
      // loadMessages(true)

      if (chat?.title === 'New Chat') {
        fetch('/api/chat/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content.trim(), chatId }),
        })
          .then(res => res.json())
          .then(d => {
            if (d.title) {
              // Update LOCAL chat state to prevent re-triggering this block
              setChat(prev => prev ? ({ ...prev, title: d.title }) : prev)

              supabase.from('chats').update({ title: d.title }).eq('id', chatId).then(() => {
                onChatChange(chatId) // Just update title in sidebar
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
