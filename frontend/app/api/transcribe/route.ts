export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file')

        if (!file) {
            return NextResponse.json(
                { error: 'No audio file provided' },
                { status: 400 }
            )
        }

        // Forward audio file to Python backend
        const backendFormData = new FormData()
        backendFormData.append('file', file)

        const baseUrl = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8099'
        // Normalize: strip trailing path segments like /upload, /chat etc.
        const cleanBaseUrl = baseUrl.replace(/\/(upload|chat|files).*$/, '')
        const transcribeUrl = `${cleanBaseUrl}/api/transcribe`

        console.log(`DEBUG: Forwarding audio to ${transcribeUrl}`)

        const response = await fetch(transcribeUrl, {
            method: 'POST',
            body: backendFormData,
        })

        if (!response.ok) {
            const errorData = await response.text()
            console.error('Transcription backend error:', errorData)
            return NextResponse.json(
                { error: 'Transcription failed', details: errorData },
                { status: 500 }
            )
        }

        const data = await response.json()
        return NextResponse.json(data)

    } catch (error: any) {
        console.error('Transcribe API Error:', error)
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        )
    }
}
