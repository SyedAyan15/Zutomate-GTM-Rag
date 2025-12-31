import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
    try {
        console.log('--- UPLOAD API DEBUG START ---')

        // Audit request for debugging
        const cookieStore = request.cookies.getAll()
        const cookieNames = cookieStore.map(c => c.name)
        const headers = Object.fromEntries(request.headers.entries())
        console.log('DEBUG: API Request Details:', {
            origin: headers.origin,
            host: headers.host,
            cookieHeader: headers.cookie ? 'Present' : 'MISSING',
            cookieNames: cookieNames
        })

        const supabase = await createClient()

        // Try both getUser (secure) and getSession (lenient)
        let { data: { user }, error: authError } = await supabase.auth.getUser()
        const { data: { session } } = await supabase.auth.getSession()

        // --- TOKEN FALLBACK ---
        // If cookies failed, try the Authorization header sent by the frontend
        if (!user && !session && headers.authorization) {
            console.log('DEBUG: Attempting Token Auth Fallback...')
            const token = headers.authorization.split(' ')[1]
            if (token) {
                const { data: tokenData } = await supabase.auth.getUser(token)
                if (tokenData.user) {
                    user = tokenData.user
                    console.log('✅ Token Auth Fallback SUCCESS')
                }
            }
        }

        const activeUser = user || session?.user

        console.log('API Auth Result:', {
            hasUser: !!user,
            hasSession: !!session,
            userId: activeUser?.id,
            error: authError?.message
        })

        if (!activeUser) {
            console.error('API Error: No active user identified')
            return NextResponse.json(
                {
                    error: 'Unauthorized',
                    details: 'No active session found. Please try refreshing or logging in again.',
                    cookie_count: cookieNames.length,
                    received_cookies: cookieNames,
                },
                { status: 401 }
            )
        }

        // --- ADMIN CHECK ---
        console.log(`DEBUG: Verifying Admin for ID: ${activeUser.id}`)

        // 1. Check Metadata Fallback (Fastest)
        let role = (activeUser as any)?.app_metadata?.role || (activeUser as any)?.user_metadata?.role

        if (role === 'admin') {
            console.log('✅ Admin verified via Metadata')
        } else {
            // 2. Check Database Profile with Service Role (Bypass RLS issues in API)
            try {
                const { createClient: createAdminClient } = await import('@supabase/supabase-js')
                const adminSupabase = createAdminClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                )

                const { data: profile } = await adminSupabase
                    .from('profiles')
                    .select('role')
                    .eq('id', activeUser.id)
                    .maybeSingle()

                if (profile?.role === 'admin') {
                    role = 'admin'
                    console.log('✅ Admin verified via Service Role Database lookup')
                } else if (profile?.role) {
                    role = profile.role
                    console.log(`DEBUG: Found user role: ${role}`)
                }
            } catch (err) {
                console.error('Admin lookup failed:', err)
            }
        }

        if (role !== 'admin') {
            const currentRole = role || 'none'
            console.warn(`User ${activeUser.id} denied - role is ${currentRole}`)
            return NextResponse.json(
                {
                    error: 'Forbidden',
                    details: 'Admin status could not be verified.',
                    hint: `Your account has the role: "${currentRole}". It must be "admin" to upload.`
                },
                { status: 403 }
            )
        }
        console.log('🚀 Admin verification SUCCESSFUL')
        // --------------------

        const formData = await request.formData()
        const file = formData.get('file')

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: 'No valid file provided' }, { status: 400 })
        }

        console.log(`DEBUG: API Route received file: ${file.name} (${file.size} bytes)`)

        // Reconstruct FormData to ensure correct boundary handling
        const backendFormData = new FormData()
        backendFormData.append('file', file, file.name)

        const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8099/upload'
        console.log(`DEBUG: Sending file to backend (${pythonBackendUrl}) with 120s timeout`)

        try {
            // Create a controller to handle the long timeout
            const controller = new AbortController()
            const id = setTimeout(() => controller.abort(), 120000) // 120 seconds

            const response = await fetch(pythonBackendUrl, {
                method: 'POST',
                body: backendFormData,
                signal: controller.signal
            })

            clearTimeout(id)

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Backend Response Error:', errorData);
                return NextResponse.json(
                    { error: 'Backend processing failed', details: errorData.detail || 'The RAG server failed to index the file.' },
                    { status: response.status }
                )
            }

            const data = await response.json()
            console.log('✅ Backend indexing successful')

            // Save file metadata to database
            try {
                console.log('💾 Saving metadata to database (Admin Client) for:', data.filename || file.name)
                const adminSupabase = await createAdminClient()
                const { data: dbData, error: dbError } = await (adminSupabase as any)
                    .from('uploaded_files')
                    .insert({
                        filename: data.filename || file.name,
                        file_size: data.file_size || file.size,
                        uploaded_by: activeUser.id,
                        chunk_count: data.chunk_count || 0,
                        file_type: data.file_type || file.type || 'application/octet-stream'
                    })
                    .select()

                if (dbError) {
                    console.warn('⚠️ DEBUG: Primary metadata save failed (possibly FK violation). Retrying without uploaded_by...', dbError.message)

                    // Fallback: Try inserting without uploaded_by (system-owned)
                    const { data: dbData2, error: dbError2 } = await (adminSupabase as any)
                        .from('uploaded_files')
                        .insert({
                            filename: data.filename || file.name,
                            file_size: data.file_size || file.size,
                            chunk_count: data.chunk_count || 0,
                            file_type: data.file_type || file.type || 'application/octet-stream'
                        })
                        .select()

                    if (dbError2) {
                        console.error('❌ CRITICAL: Database metadata save completely failed:', dbError2)
                        return NextResponse.json({
                            ...data,
                            warning: 'File indexed but metadata tracking failed. It might not appear in your list.',
                            db_error: dbError2.message
                        })
                    }
                    console.log('✅ Metadata saved successfully via Fallback:', dbData2)
                } else {
                    console.log('✅ Metadata saved successfully:', dbData)
                }
            } catch (metaErr: any) {
                console.error('❌ Metadata save exception:', metaErr)
            }

            return NextResponse.json(data)
        } catch (fetchErr: any) {
            console.error('CRITICAL: Backend Fetch Failed:', fetchErr.name, fetchErr.message)

            if (fetchErr.name === 'AbortError') {
                return NextResponse.json(
                    { error: 'Upload Timeout', details: 'The indexing process took longer than 2 minutes. The file might still be processing on the server.' },
                    { status: 504 }
                )
            }

            const isOffline = fetchErr.message.includes('ECONNREFUSED') || fetchErr.message.includes('fetch failed')
            return NextResponse.json(
                {
                    error: isOffline ? 'Python Backend Offline' : 'Backend Communication Error',
                    details: isOffline ? 'The Python RAG server is not responding. Please ensure it is running with "python main.py".' : fetchErr.message
                },
                { status: 503 }
            )
        }

    } catch (error: any) {
        console.error('API Upload Route Error:', error)
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        )
    }
}
