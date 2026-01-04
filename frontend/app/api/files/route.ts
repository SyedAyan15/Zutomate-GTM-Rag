export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '../../../lib/supabase/server'

// GET: List all uploaded files
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()

        // Verify admin
        let { data: { user }, error: authError } = await supabase.auth.getUser()

        // Fallback: Check for Bearer token if cookie auth fails
        if (!user) {
            console.log('⚠️ Cookie Auth failed. Checking Authorization header...')
            const authHeader = request.headers.get('Authorization')
            if (authHeader) {
                const token = authHeader.split(' ')[1]
                const { createClient: createDirectClient } = require('@supabase/supabase-js')
                const directClient = createDirectClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                    { global: { headers: { Authorization: `Bearer ${token}` } } }
                )
                const { data: directUser } = await directClient.auth.getUser()
                if (directUser.user) {
                    console.log('✅ Authorized via Bearer Token')
                    user = directUser.user
                }
            }
        }

        console.log('API /api/files Debug:')
        console.log('- Cookies present:', request.cookies.getAll().length)
        console.log('- User ID:', user?.id || 'None')
        console.log('- Auth Error:', authError?.message || 'None')

        if (!user) {
            console.error('❌ Unauthorized: No user found via getUser() or Token')
            return NextResponse.json({ error: 'Unauthorized: Session missing or invalid' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if ((profile as any)?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Get all files using admin client to bypass RLS
        console.log('DEBUG: Fetching files with Admin Client...')
        const adminSupabase = await createAdminClient()
        const { data: files, error } = await (adminSupabase as any)
            .from('uploaded_files')
            .select('*')
            .order('uploaded_at', { ascending: false })

        if (error) {
            console.error('DEBUG: Error fetching files with Admin Client:', error)
            return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 })
        }

        console.log(`DEBUG: Successfully fetched ${files?.length || 0} files.`)
        if (files && files.length > 0) {
            console.log('DEBUG: First file:', files[0].filename)
        }

        return NextResponse.json({ files: files || [] })
    } catch (error: any) {
        console.error('Files API error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// DELETE: Delete a file
export async function DELETE(request: NextRequest) {
    try {
        let supabase = await createClient()

        // Verify admin
        let { data: { user } } = await supabase.auth.getUser()

        // Fallback: Check for Bearer token
        if (!user) {
            const authHeader = request.headers.get('Authorization')
            if (authHeader) {
                const token = authHeader.split(' ')[1]
                const { createClient: createDirectClient } = require('@supabase/supabase-js')
                const directClient = createDirectClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                    { global: { headers: { Authorization: `Bearer ${token}` } } }
                )
                const { data: directUser } = await directClient.auth.getUser()
                if (directUser.user) {
                    user = directUser.user
                    // CRITICAL FIX: Use the authenticated client for subsequent requests
                    supabase = directClient
                }
            }
        }

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if ((profile as any)?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const fileId = searchParams.get('id')
        const filename = searchParams.get('filename')

        if (!fileId || !filename) {
            return NextResponse.json({ error: 'File ID and filename required' }, { status: 400 })
        }

        // Delete from Python backend (Pinecone)
        const pythonBackendUrl = process.env.PYTHON_BACKEND_URL?.replace('/upload', `/files/${encodeURIComponent(filename)}`) || `http://127.0.0.1:8099/files/${encodeURIComponent(filename)}`

        try {
            await fetch(pythonBackendUrl, { method: 'DELETE' })
        } catch (err) {
            console.warn('Backend deletion warning:', err)
            // Continue even if backend fails
        }

        // Delete from database
        const { error: dbError } = await (supabase as any)
            .from('uploaded_files')
            .delete()
            .eq('id', fileId)

        if (dbError) {
            console.error('Database deletion error:', dbError)
            return NextResponse.json({ error: 'Failed to delete file from database' }, { status: 500 })
        }

        return NextResponse.json({ message: 'File deleted successfully' })
    } catch (error: any) {
        console.error('Delete file error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
