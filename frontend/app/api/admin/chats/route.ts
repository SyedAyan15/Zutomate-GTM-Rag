export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json({ chats: [] })
        }

        const adminSupabase = (await import('@supabase/supabase-js')).createClient(
            supabaseUrl,
            serviceKey
        )

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
                { error: 'Failed to fetch chats', details: chatsError.message },
                { status: 500 }
            )
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
