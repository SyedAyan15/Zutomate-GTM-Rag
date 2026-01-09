export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const getAdminClient = () => {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

// GET: Fetch system settings
export async function GET(request: NextRequest) {
    const start = Date.now();
    try {
        // Use a single, efficient client for admin check
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Quick profile check using service role to bypass RLS complexity
        const adminSupabase = getAdminClient()
        const { data: profile } = await adminSupabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if ((profile as any)?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        console.log(`Settings API: Auth check took ${Date.now() - start}ms`);

        // Fetch system prompt from Python backend with robust URL construction
        let baseUrl = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8099'
        const cleanBaseUrl = baseUrl.replace(/\/upload$/, '').replace(/\/$/, '')
        const pythonBackendUrl = `${cleanBaseUrl}/settings/system-prompt`

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000) // 3s timeout for backend

        try {
            const response = await fetch(pythonBackendUrl, { signal: controller.signal })
            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error(`Backend fetch failed: ${response.status}`)
            }
            const data = await response.json()

            // Validate that we actually got a prompt back
            if (!data || typeof data.system_prompt === 'undefined') {
                throw new Error('Invalid response from backend: missing system_prompt')
            }

            console.log(`Settings API: Backend fetch took ${Date.now() - start}ms total`);
            return NextResponse.json(data)
        } catch (err: any) {
            clearTimeout(timeoutId)
            console.error('Settings API: Backend fetch error:', err.name === 'AbortError' ? 'Timeout' : err.message)

            // Fallback: Try fetching directly from Supabase if backend is slow/offline
            // This prevents the screen from being stuck on "Loading"
            const { data: settings } = await adminSupabase
                .from('system_settings')
                .select('setting_value')
                .eq('setting_key', 'system_prompt')
                .single()

            return NextResponse.json({
                system_prompt: settings?.setting_value || 'Direct fetch fallback',
                is_fallback: true
            })
        }
    } catch (error: any) {
        console.error('Settings GET error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PUT: Update system settings
export async function PUT(request: NextRequest) {
    try {
        let supabase = await createClient()

        // Verify admin
        let { data: { user } } = await supabase.auth.getUser()

        // Fallback: Check for Bearer token
        if (!user) {
            const authHeader = request.headers.get('Authorization')
            if (authHeader) {
                const token = authHeader.split(' ')[1]
                const directClient = createSupabaseClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                    { global: { headers: { Authorization: `Bearer ${token}` } } }
                )
                const { data: directUser } = await directClient.auth.getUser()
                if (directUser.user) {
                    user = directUser.user
                }
            }
        }

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Use Admin Client for DB operations to bypass RLS
        const adminSupabase = getAdminClient()

        const { data: profile } = await adminSupabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if ((profile as any)?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await request.json()
        const { system_prompt } = body

        if (!system_prompt || system_prompt.trim().length === 0) {
            return NextResponse.json({ error: 'System prompt cannot be empty' }, { status: 400 })
        }

        // Update in Python backend with robust URL construction
        let baseUrl = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8099'
        const cleanBaseUrl = baseUrl.replace(/\/upload$/, '').replace(/\/$/, '')
        const pythonBackendUrl = `${cleanBaseUrl}/settings/system-prompt`

        try {
            const response = await fetch(pythonBackendUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ system_prompt })
            })

            if (!response.ok) {
                throw new Error('Backend update failed')
            }

            const data = await response.json()

            // Also update in Supabase for persistence using Admin Client
            await adminSupabase
                .from('system_settings')
                .upsert({
                    setting_key: 'system_prompt',
                    setting_value: system_prompt,
                    updated_by: user.id,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'setting_key'
                })

            return NextResponse.json(data)
        } catch (err) {
            console.error('Backend update error:', err)
            return NextResponse.json({ error: 'Failed to update system prompt' }, { status: 500 })
        }
    } catch (error: any) {
        console.error('Settings PUT error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
