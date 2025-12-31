'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Chat } from '@/lib/types'

interface ChatSidebarProps {
  currentChatId: string | null
  onChatSelect: (chatId: string | null) => void
  isAdmin?: boolean
  activeView?: 'chat' | 'knowledge' | 'settings'
  onViewSelect?: (view: 'chat' | 'knowledge' | 'settings') => void
  onUploadSuccess?: () => void
}

export default function ChatSidebar({
  currentChatId,
  onChatSelect,
  isAdmin,
  activeView = 'chat',
  onViewSelect,
  onUploadSuccess,
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

    if (!user) return

    const channel = supabase
      .channel('chats')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chats',
          filter: isAdmin ? undefined : `user_id=eq.${user.id}`,
        },
        () => {
          loadChats()
        }
      )
      .subscribe()
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
      <div className="w-64 bg-gray-100 p-4">
        <p className="text-gray-500">Loading chats...</p>
      </div>
    )
  }

  return (
    <div className="w-64 bg-gray-100 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={handleNewChat}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          + New Chat
        </button>
        {isAdmin && (
          <div className="mt-4 space-y-2">
            <div className="h-px bg-gray-200 my-4"></div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2">Admin Controls</p>
            <button
              onClick={() => onViewSelect?.('chat')}
              className={`w-full flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'chat' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <span>💬</span> <span>Chat Logs</span>
            </button>
            <button
              onClick={() => onViewSelect?.('knowledge')}
              className={`w-full flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'knowledge' ? 'bg-green-50 text-green-600' : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <span>📁</span> <span>Knowledge Base</span>
            </button>
            <button
              onClick={() => onViewSelect?.('settings')}
              className={`w-full flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'settings' ? 'bg-purple-50 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <span>⚙️</span> <span>System Prompt</span>
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {chats.length === 0 ? (
          <p className="text-gray-500 text-sm text-center p-4">
            No chats yet. Create a new chat to get started!
          </p>
        ) : (
          <div className="space-y-1">
            {chats.map((chat: any) => (
              <div
                key={chat.id}
                onClick={() => onChatSelect(chat.id)}
                className={`p-3 rounded-lg cursor-pointer hover:bg-gray-200 ${currentChatId === chat.id ? 'bg-gray-300' : ''
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{chat.title || 'Untitled Chat'}</p>
                    {isAdmin && chat.profiles && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {chat.profiles.email || 'Unknown User'}
                      </p>
                    )}
                  </div>
                  {!isAdmin && (
                    <button
                      onClick={(e) => handleDeleteChat(chat.id, e)}
                      className="ml-2 text-gray-500 hover:text-red-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(chat.updated_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
