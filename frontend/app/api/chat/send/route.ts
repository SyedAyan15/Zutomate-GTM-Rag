export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const headers = Object.fromEntries(request.headers.entries())
    const supabase = await createClient()

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

    // Get chat history for context
    const { data: messages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .limit(10)

    const conversationHistory = (messages || []).map((msg: any) => ({
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }))
        console.error('Python Backend Error:', errorData)
        return NextResponse.json({ error: 'Backend Error', details: errorData.detail || 'The RAG server failed to process the message.' }, { status: 500 })
      }

      const data = await response.json()
      const backendResponse = data.response || data.message || 'I processed your request.'
      const responseText = typeof backendResponse === 'string' ? backendResponse : JSON.stringify(backendResponse)

      // --- PERSIST MESSAGES TO DATABASE ---
      console.log('💾 Saving message pair to database...')
      try {
        const supabaseAny = supabase as any
        // 1. Save user message
        await supabaseAny.from('messages').insert({
          chat_id: chatId,
          role: 'user',
          content: message,
          user_id: activeUser.id
        })

        // 2. Save assistant response
        await supabaseAny.from('messages').insert({
          chat_id: chatId,
          role: 'assistant',
          content: responseText,
          user_id: activeUser.id
        })

        // 3. Update chat timestamp
        await supabaseAny.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId)
        console.log('✅ Messages persisted successfully')
      } catch (dbError) {
        console.error('❌ Database persistence error:', dbError)
      }

      return NextResponse.json({
        response: responseText,
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
