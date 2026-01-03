import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/lib/types'

let client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // During build time on Vercel, these might be missing. 
    // We shouldn't throw here as it crashes the build.
    console.warn(
      'Supabase environment variables are missing. This is expected during some build phases, but required for runtime.'
    )
    // Return a dummy client or null to prevent crash
    return {
      auth: {},
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => ({ data: null, error: null }),
            order: () => ({ data: [], error: null })
          })
        })
      })
    } as any
  }

  if (client) return client

  client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
  return client
}
