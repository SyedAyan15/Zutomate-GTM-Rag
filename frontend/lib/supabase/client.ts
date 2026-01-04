import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/lib/types'

let client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        // Build-time safety dummy client
        console.warn('Supabase env vars missing. Using build-time dummy client.')
        return {
            auth: {
                getUser: () => Promise.resolve({ data: { user: null }, error: null }),
                getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            },
            from: () => ({
                select: () => ({
                    eq: () => ({
                        single: () => Promise.resolve({ data: null, error: null }),
                        order: () => Promise.resolve({ data: [], error: null })
                    })
                })
            })
        } as any
    }

    if (client) return client

    client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
    return client
}
