export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    console.log('[Admin Chats API] Request received')

    // Use Service Role client to bypass RLS and fetch all chats
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase configuration missing')
    }

    const adminSupabase = createAdminClient(
      supabaseUrl,
      serviceKey
    )

    console.log('[Admin Chats API] Fetching all chats with user profiles...')

    const { data: chats, error: chatsError } = await adminSupabase
      .from('chats')
      .select(`
        *,
        profiles!left(id, email)
      `)
      .order('updated_at', { ascending: false })

    if (chatsError) {
      console.error('[Admin Chats API] Supabase error:', chatsError)
      return NextResponse.json(
        { error: 'Failed to fetch chats', details: chatsError.message, code: chatsError.code },
        { status: 500 }
      )
    }

    console.log(`[Admin Chats API] Successfully fetched ${chats?.length || 0} chats`)

    // Log first chat for debugging
    if (chats && chats.length > 0) {
      console.log('[Admin Chats API] Sample chat:', {
        id: chats[0].id,
        title: chats[0].title,
        user_email: chats[0].profiles?.email
      })
    }

    return NextResponse.json({ chats: chats || [] })
  } catch (error: any) {
    console.error('[Admin Chats API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
