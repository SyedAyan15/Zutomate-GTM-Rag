import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { message, chatId } = body

        if (!message || !chatId) {
            return NextResponse.json(
                { error: 'Message and chatId are required' },
                { status: 400 }
            )
        }

        const pythonBackendUrl = process.env.PYTHON_BACKEND_URL?.replace('/chat', '/generate_title')?.replace('/upload', '/generate_title') || 'http://127.0.0.1:8000/generate_title'

        const response = await fetch(pythonBackendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, chatId }),
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.detail || errorData.error || `Backend error: ${response.status}`)
        }

        const data = await response.json()
        return NextResponse.json(data)

    } catch (error: any) {
        console.error('Title Gen Error:', error.message)
        return NextResponse.json(
            { error: 'Failed to generate title', details: error.message },
            { status: 500 }
        )
    }
}
