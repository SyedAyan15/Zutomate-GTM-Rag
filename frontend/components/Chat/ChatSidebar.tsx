'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase/client'
import type { Chat } from '../../lib/types'
import { LogOut, X } from 'lucide-react'

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
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadChats()
    subscribeToChats()
  }, [])

  const loadChats = async () => {
    if (isAdmin) {
      try {
        console.log('[Admin] Loading all user chats...')
        const { data: { session } } = await supabase.auth.getSession()
        const headers: Record<string, string> = {}
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }

        const response = await fetch('/api/admin/chats', {
          headers: headers
        })

        console.log('[Admin] API Response Status:', response.status)

        if (response.ok) {
          const data = await response.json()
          console.log('[Admin] Chats received:', data.chats?.length || 0)
          console.log('[Admin] Sample chat:', data.chats?.[0])
          setChats(data.chats || [])
        } else {
          const errorData = await response.json()
          console.error('[Admin] Failed to load chats:', response.status, errorData)
        }
      } catch (error) {
        console.error('[Admin] Error loading admin chats:', error)
      }
      setLoading(false)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

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
  }

  const subscribeToChats = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user && !isAdmin) return

    // Admin listens to ALL chats, User listens to OWN chats
    const filterConfig = isAdmin ? {} : { filter: `user_id=eq.${user?.id}` }

    const channel = supabase
      .channel('chats')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chats',
          ...filterConfig,
        },
        () => {
          console.log('[Sidebar] Chats updated, reloading...')
          loadChats()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const handleNewChat = async () => {
    console.log('[ChatSidebar] Creating new chat...')
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.error('[ChatSidebar] No user found, cannot create chat')
      return
    }

    console.log('[ChatSidebar] User ID:', user.id)

    const { data, error } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        title: 'New Chat',
      } as any)
      .select()
      .single()

    if (error) {
      console.error('[ChatSidebar] Error creating chat:', error)
      console.error('[ChatSidebar] Error details:', JSON.stringify(error, null, 2))
      alert(`Failed to create chat: ${error.message}`)
      return
    }

    console.log('[ChatSidebar] Chat created successfully:', data)
    if (data) {
      onChatSelect((data as any).id)
    }
  }

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const { error } = await supabase.from('chats').delete().eq('id', chatId)

    if (!error) {
      if (currentChatId === chatId) {
        onChatSelect(null)
      }
      loadChats()
    }
  }

  if (loading) {
    return (
      <div className="w-64 bg-[#0A192F] p-4 flex items-center justify-center">
        <div className="flex space-x-2">
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-[#0A192F] border-r border-[#112240] flex flex-col text-white shadow-2xl">
      <div className="p-5 border-b border-[#112240] flex items-center justify-between">
        <div className="flex items-center">
          <img src="/logo.png" alt="Zutomate" className="h-8 object-contain" />
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      <div className="p-4 border-b border-[#112240]">
        <button
          onClick={handleNewChat}
          className="w-full px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-lg hover:from-orange-600 hover:to-amber-600 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all shadow-lg shadow-orange-500/20"
        >
          + New Chat
        </button>
        {isAdmin && (
          <div className="mt-4 space-y-2">
            <div className="h-px bg-[#112240] my-4"></div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2 mb-2">Admin Controls</p>
            <button
              onClick={() => onViewSelect?.('chat')}
              className={`w-full flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'chat' ? 'bg-orange-500/10 text-orange-500' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
            >
              <span>Chat Logs</span>
            </button>
            <button
              onClick={() => onViewSelect?.('knowledge')}
              className={`w-full flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'knowledge' ? 'bg-orange-500/10 text-orange-500' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
            >
              <span>Knowledge Base</span>
            </button>
            <button
              onClick={() => onViewSelect?.('settings')}
              className={`w-full flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'settings' ? 'bg-orange-500/10 text-orange-500' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
            >
              <span>System Prompt</span>
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-orange-500/20">
        {chats.length === 0 ? (
          <p className="text-gray-500 text-sm text-center p-4 italic">
            No chats yet.
          </p>
        ) : (
          <div className="space-y-1">
            {chats.map((chat: any) => (
              <div
                key={chat.id}
                onClick={(e) => {
                  e.preventDefault()
                  console.log('[Sidebar] Selected chat:', chat.id)
                  onChatSelect(chat.id)
                }}
                className={`p-3 rounded-lg cursor-pointer transition-all ${currentChatId === chat.id
                  ? 'bg-orange-500/20 border-l-4 border-orange-500 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{chat.title || 'Untitled Chat'}</p>
                    {isAdmin && chat.profiles && (
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">
                        {chat.profiles.email || 'Unknown User'}
                      </p>
                    )}
                  </div>
                  {!isAdmin && (
                    <button
                      onClick={(e) => handleDeleteChat(chat.id, e)}
                      className="ml-2 text-gray-500 hover:text-orange-500 transition-colors"
                    >
                      <span className="text-lg">×</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-gray-500">
                    {new Date(chat.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="p-4 border-t border-[#112240]">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-blue-400 hover:text-blue-300 hover:bg-white/5 rounded-lg transition-all font-bold text-xs uppercase tracking-widest"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}
