import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/lib/types'

let client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Please check your .env.local file.'
    )
  }

  if (client) return client

  client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
  return client
}
