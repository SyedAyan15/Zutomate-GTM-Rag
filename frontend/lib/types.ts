export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          username: string | null
          role: 'user' | 'admin'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          username?: string | null
          role?: 'user' | 'admin'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          username?: string | null
          role?: 'user' | 'admin'
          created_at?: string
          updated_at?: string
        }
      }
      chats: {
        Row: {
          id: string
          user_id: string
          title: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          chat_id: string
          user_id: string
          content: string
          role: 'user' | 'assistant'
          created_at: string
        }
        Insert: {
          id?: string
          chat_id: string
          user_id: string
          content: string
          role: 'user' | 'assistant'
          created_at?: string
        }
        Update: {
          id?: string
          chat_id?: string
          user_id?: string
          content?: string
          role?: 'user' | 'assistant'
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Chat = Database['public']['Tables']['chats']['Row']
export type Message = Database['public']['Tables']['messages']['Row']

export type MessageWithUser = Message & {
  user?: {
    email: string | null
    username: string | null
  }
}

