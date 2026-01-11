export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { Database } from '../../../../lib/types'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const headers = Object.fromEntries(request.headers.entries())

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const supabase = createServerClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            // In a Route Handler, we can't easily set cookies on the request.
          }
        }
      }
    )

    // Try both getUser (secure) and getSession (lenient)
    let { data: { user }, error: authError } = await supabase.auth.getUser()
    const { data: { session } } = await supabase.auth.getSession()

    // --- TOKEN FALLBACK ---
    if (!user && !session && headers.authorization) {
      const token = headers.authorization.split(' ')[1]
      if (token) {
        const { data: tokenData } = await supabase.auth.getUser(token)
        if (tokenData.user) user = tokenData.user
      }
    }

    const activeUser = user || session?.user

    if (!activeUser) {
      console.error('Chat API: No active user found')
      return NextResponse.json({ error: 'Unauthorized', details: 'Session missing. Please log in again.' }, { status: 401 })
    }

    const body = await request.json()
    const { message, chatId, userId } = body

    if (!message || !chatId) {
      return NextResponse.json(
        { error: 'Message and chatId are required' },
        { status: 400 }
      )
    }

    // Get chat history for context using Admin Client to bypass RLS issues
    const adminSupabase = await createAdminClient()
    const { data: messages } = await adminSupabase
      .from('messages')
      .select('role, content')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(15)

    // Reverse to get chronological order
    const chronologicalMessages = [...(messages || [])].reverse()
    // 1. PERSIST USER MESSAGE IMMEDIATELY
    // This ensures the question is saved even if the AI backend fails or times out
    try {
      const supabaseAny = supabase as any
      await supabaseAny.from('messages').insert({
        chat_id: chatId,
        role: 'user',
        content: message,
        user_id: activeUser.id
      })
      console.log('✅ User message persisted')
    } catch (dbError) {
      console.error('❌ User message persistence error:', dbError)
      // We continue anyway so the user might still get an answer even if save failed
    }

    const conversationHistory = chronologicalMessages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }))

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL?.replace('/upload', '/chat') || 'http://127.0.0.1:8099/chat'

    console.log(`DEBUG: Sending to Python Backend (${pythonBackendUrl})`, { chatId, messageLength: message.length })

    try {
      const response = await fetch(pythonBackendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          userId: activeUser.id,
          chatId,
          history: conversationHistory,
        }),
      })

      let data;
      const responseTextForLog = await response.text();
      try {
        data = JSON.parse(responseTextForLog);
      } catch (e) {
        console.error('Python Backend returned non-JSON:', responseTextForLog);
        return NextResponse.json({
          response: 'Zutomate backend is busy or returned an invalid format. Please try again in 5 seconds.',
          error: 'Backend Malformed Response'
        }, { status: 500 });
      }

      if (!response.ok) {
        console.error('Python Backend Error:', data)
        return NextResponse.json({
          error: 'Backend Error',
          details: data?.detail || data?.error || 'The RAG server failed to process the message.'
        }, { status: 500 })
      }

      const backendResponse = data.response || data.message || 'I processed your request.'
      const finalResponseText = typeof backendResponse === 'string' ? backendResponse : JSON.stringify(backendResponse)

      // 2. PERSIST ASSISTANT RESPONSE
      console.log('💾 Saving assistant response to database...')
      try {
        const supabaseAny = supabase as any
        await supabaseAny.from('messages').insert({
          chat_id: chatId,
          role: 'assistant',
          content: finalResponseText,
          user_id: activeUser.id
        })

        // 3. Update chat timestamp
        await supabaseAny.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId)
        console.log('✅ Assistant response persisted successfully')
      } catch (dbError) {
        console.error('❌ Assistant persistence error:', dbError)
      }

      return NextResponse.json({
        response: finalResponseText,
      })
    } catch (backendError: any) {
      console.error('Chat API Error:', backendError.message)

      if (backendError.message.includes('fetch failed')) {
        return NextResponse.json({
          response: "The Python RAG backend is not reachable. Please ensure the Python server is running on port 8099.",
        })
      }

      throw backendError
    }

  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
