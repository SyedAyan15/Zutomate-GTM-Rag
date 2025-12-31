'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ChatInterface from '@/components/Chat/ChatInterface'
import ChatSidebar from '@/components/Chat/ChatSidebar'
import KnowledgeBase from '@/components/Admin/KnowledgeBase'
import AdminSettings from '@/components/Admin/AdminSettings'

type ViewType = 'chat' | 'knowledge' | 'settings'

export default function DashboardPage() {
  const [chatId, setChatId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<ViewType>('chat')
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuth()
  }, [retryCount])

  const checkAuth = async () => {
    try {
      console.log(`--- DASHBOARD AUTH CHECK (Attempt ${retryCount + 1}) ---`)
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession()

      console.log('Session result:', {
        hasSession: !!currentSession,
        userId: currentSession?.user?.id,
        error: sessionError?.message
      })

      if (!currentSession) {
        // If no session, try one retry after a short delay (could be race condition)
        if (retryCount < 1) {
          console.log('No session yet, retrying in 1s...')
          setTimeout(() => setRetryCount(prev => prev + 1), 1000)
          return
        }
        setSession(null)
        setLoading(false)
        return
      }

      setSession(currentSession)
      console.log('DEBUG: User ID from session:', currentSession.user.id)

      // Check if user is admin
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentSession.user.id)
        .single()

      console.log('DEBUG: Profile fetched:', profile)
      if (profileError) {
        console.error('DEBUG: Profile fetch error:', profileError)
      }

      if ((profile as any)?.role === 'admin') {
        console.log('DEBUG: User is ADMIN')
        setIsAdmin(true)
      } else {
        console.log('DEBUG: User is NOT admin. Role found:', (profile as any)?.role)
      }

      setLoading(false)
    } catch (error) {
      console.error('Fatal auth check error:', error)
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login' // Use hard redirect for logout too
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600 font-medium">Verifying session...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="h-screen flex flex-col bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Zutomate</h1>
          <div>
            <a href="/login" className="text-blue-600 hover:text-blue-800 font-medium">
              Login
            </a>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-700">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Session Not Found</h2>
            <p className="text-gray-600 mb-8">
              We couldn't find an active login session. This might happen if your login expired or if cookies are disabled.
            </p>
            <a
              href="/login"
              className="block w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Sign In Again
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-gray-800">Zutomate</h1>
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded uppercase">
            Dashboard
          </span>
        </div>
        <div className="flex items-center space-x-6">
          {isAdmin && (
            <div className="flex items-center bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold border border-purple-200">
              <span className="mr-1">🛡️</span> Admin View
            </div>
          )}
          <div className="h-6 w-px bg-gray-200"></div>
          <button
            onClick={handleLogout}
            className="text-gray-600 hover:text-red-600 text-sm font-medium transition-colors"
          >
            Logout
          </button>
        </div>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <ChatSidebar
          currentChatId={chatId}
          onChatSelect={(id) => {
            setChatId(id)
            setActiveView('chat')
          }}
          isAdmin={isAdmin}
          activeView={activeView}
          onViewSelect={setActiveView}
          onUploadSuccess={() => setRefreshKey(prev => prev + 1)}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeView === 'chat' && (
            <ChatInterface chatId={chatId} onChatChange={setChatId} />
          )}
          {activeView === 'knowledge' && (
            <div className="flex-1 overflow-y-auto bg-white">
              <KnowledgeBase key={refreshKey} />
            </div>
          )}
          {activeView === 'settings' && (
            <div className="flex-1 overflow-y-auto bg-white p-8">
              <AdminSettings />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
