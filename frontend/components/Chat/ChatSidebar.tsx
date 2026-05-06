'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '../../lib/supabase/client'
import type { Chat } from '../../lib/types'
import { LogOut, X } from 'lucide-react'

type ChatWithProfile = Chat & {
  profiles?: { email: string | null; username?: string | null }
}

interface ChatSidebarProps {
  currentChatId: string | null
  onChatSelect: (chatId: string | null) => void
  isAdmin?: boolean
  activeView?: 'chat' | 'knowledge' | 'settings'
  onViewSelect?: (view: 'chat' | 'knowledge' | 'settings') => void
  onUploadSuccess?: () => void
  onLogout?: () => void
  onClose?: () => void
}

export default function ChatSidebar({
  currentChatId,
  onChatSelect,
  isAdmin,
  activeView = 'chat',
  onViewSelect,
  onUploadSuccess,
  onLogout,
  onClose,
}: ChatSidebarProps) {
  const [chats, setChats] = useState<ChatWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useRef(createClient()).current

  const loadChats = useCallback(async () => {
    if (isAdmin) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const headers: Record<string, string> = {}
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }
        const response = await fetch('/api/admin/chats', { headers })
        if (response.ok) {
          const data = await response.json()
          setChats(data.chats || [])
        } else {
          console.error('[Admin] Failed to load chats:', response.status)
        }
      } catch (error) {
        console.error('[Admin] Error loading admin chats:', error)
      }
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (!error && data) {
      setChats(data)
    }
    setLoading(false)
  }, [isAdmin, supabase])

  const subscribeToChats = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user && !isAdmin) return

    const filterConfig = isAdmin ? {} : { filter: `user_id=eq.${user?.id}` }

    const channel = supabase
      .channel('chats')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', ...filterConfig },
        () => loadChats()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isAdmin, supabase, loadChats])

  useEffect(() => {
    loadChats()
    let cleanup: (() => void) | undefined
    subscribeToChats().then(fn => { cleanup = fn })
    return () => cleanup?.()
  }, [loadChats, subscribeToChats])

  const handleNewChat = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('chats')
      .insert({ user_id: user.id, title: 'New Chat' })
      .select()
      .single()

    if (error) {
      console.error('[ChatSidebar] Error creating chat:', error)
      alert(`Failed to create chat: ${error.message}`)
      return
    }

    if (data) {
      onChatSelect(data.id)
    }
  }

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const { error } = await supabase.from('chats').delete().eq('id', chatId)
    if (!error) {
      if (currentChatId === chatId) onChatSelect(null)
      loadChats()
    }
  }

  if (loading) {
    return (
      <div className="w-64 bg-[var(--navy-card)] p-4 flex items-center justify-center">
        <div className="flex space-x-2">
          <div className="w-2 h-2 bg-[var(--orange)] rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-[var(--orange)] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-[var(--orange)] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-[var(--navy-card)] border-r border-[var(--border)] flex flex-col text-[var(--off)] shadow-2xl">
      <div className="py-3 px-5 border-b border-[var(--border)] flex items-center justify-center relative">
        <img src="/zutomate-logo-transparent.svg" alt="Zutomate" className="h-24 w-24" />
        <button
          onClick={onClose}
          className="md:hidden p-2 hover:bg-white/10 rounded-full transition-colors absolute right-4"
        >
          <X className="h-5 w-5 text-[var(--muted)]" />
        </button>
      </div>

      <div className="p-4 border-b border-[var(--border)]">
        <button onClick={handleNewChat} className="w-full btn-primary">
          + New Chat
        </button>
        {isAdmin && (
          <div className="mt-4 space-y-2">
            <div className="h-px bg-[var(--border)] my-4"></div>
            <p className="small-label px-2 mb-2 text-[var(--muted)]">Admin Controls</p>
            {(['chat', 'knowledge', 'settings'] as const).map((view) => (
              <button
                key={view}
                onClick={() => onViewSelect?.(view)}
                className={`w-full flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeView === view
                    ? 'bg-[var(--faint)] text-[var(--orange)]'
                    : 'text-[var(--muted)] hover:bg-[var(--faint)] hover:text-[var(--white)]'
                }`}
              >
                <span>{view === 'chat' ? 'Chat Logs' : view === 'knowledge' ? 'Knowledge Base' : 'System Prompt'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-[var(--orange)]">
        {chats.length === 0 ? (
          <p className="text-[var(--muted)] text-sm text-center p-4 italic">No chats yet.</p>
        ) : (
          <div className="space-y-1">
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => onChatSelect(chat.id)}
                className={`p-3 rounded-lg cursor-pointer transition-all ${
                  currentChatId === chat.id
                    ? 'bg-[var(--faint)] border-l-4 border-[var(--orange)] text-[var(--white)]'
                    : 'text-[var(--muted)] hover:bg-[var(--faint)] hover:text-[var(--white)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{chat.title || 'Untitled Chat'}</p>
                    {isAdmin && chat.profiles && (
                      <p className="text-[10px] text-[var(--muted)] truncate mt-0.5">
                        {chat.profiles.email ?? 'Unknown User'}
                      </p>
                    )}
                  </div>
                  {!isAdmin && (
                    <button
                      onClick={(e) => handleDeleteChat(chat.id, e)}
                      className="ml-2 text-[var(--muted)] hover:text-[var(--orange)] transition-colors"
                    >
                      <span className="text-lg">×</span>
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-[var(--muted)] mt-1">
                  {new Date(chat.updated_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[var(--border)]">
        <button
          onClick={onLogout}
          className="btn-secondary w-full flex items-center justify-center space-x-2 px-4 py-2"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}
