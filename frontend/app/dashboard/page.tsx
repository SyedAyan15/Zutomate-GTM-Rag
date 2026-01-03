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
      <div className="min-h-screen flex flex-col bg-[#0A192F] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A192F] to-[#112240] opacity-90"></div>
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-500"></div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10 text-center">
          <div className="bg-white/5 backdrop-blur-md p-10 rounded-2xl border border-white/10 max-w-md w-full shadow-2xl">
            <h1 className="text-4xl font-bold text-orange-500 mb-2">Zutomate</h1>
            <div className="w-16 h-1 bg-orange-500 mx-auto mb-8 rounded-full"></div>

            <h2 className="text-2xl font-bold text-white mb-4">Session Expired</h2>
            <p className="text-gray-400 mb-8 leading-relaxed">
              We couldn't find an active login session. Please sign in again to continue.
            </p>
            <a
              href="/login"
              className="block w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-bold hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/20 transform hover:-translate-y-1"
            >
              Back to Login
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
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
          onLogout={handleLogout}
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
