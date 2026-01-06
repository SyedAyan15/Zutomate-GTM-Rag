export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { Database } from '../../../../lib/types'

export async function GET(request: NextRequest) {
    try {
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
                        // Session refresh should generally happen in Middleware.
                        // We leave this empty to prevent errors if Supabase tries to set cookies.
                    }
                }
            }
        )

        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if user is admin
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        const userRole = (profile as any)?.role

        if (userRole !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const chatId = searchParams.get('chatId')

        if (!chatId) {
            return NextResponse.json(
                { error: 'chatId parameter is required' },
                { status: 400 }
            )
        }

        const { data: messages, error: messagesError } = await supabase
            .from('messages')
            .select(`
        *,
        profiles:user_id (
          email,
          username
        )
      `)
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true })

        if (messagesError) {
            return NextResponse.json(
                { error: 'Failed to fetch messages', details: messagesError.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ messages: messages || [] })
    } catch (error: any) {
        console.error('Error fetching messages:', error)
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        )
    }
}
