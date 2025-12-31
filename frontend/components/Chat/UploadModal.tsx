'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UploadModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess?: () => void
}

export default function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const supabase = createClient()

    if (!isOpen) return null

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            setMessage(null)
        }
    }

    const handleUpload = async () => {
        if (!file) {
            setMessage({ type: 'error', text: 'Please choose a file first.' })
            return
        }

        setUploading(true)
        setMessage(null) // Clear any previous messages

        try {
            const { data: { session } } = await supabase.auth.getSession()
            const headers: Record<string, string> = {}
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`
            }

            const formData = new FormData()
            formData.append('file', file)

            // --- TIMEOUT PROTECTION ---
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s timeout

            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: headers,
                body: formData,
                credentials: 'include',
                signal: controller.signal
            })

            clearTimeout(timeoutId)
            const data = await response.json()

            if (data.warning) {
                setMessage({ type: 'error', text: `Warning: ${data.warning} (${data.db_error || 'Database error'})` })
                if (onSuccess) onSuccess()
                return // Leave modal open so they can see the warning
            }

            if (!response.ok) {
                throw new Error(data.details || data.error || `Upload failed (${response.status})`)
            }

            setMessage({ type: 'success', text: 'File uploaded and processed successfully!' })
            if (onSuccess) onSuccess()

            setTimeout(() => {
                onClose()
                setMessage(null) // Clear success message after closing
                setFile(null) // Reset file input
            }, 2000) // Close modal and reset after 2 seconds
        } catch (error: any) {
            console.error('Upload error:', error)
            setMessage({ type: 'error', text: error.message || 'The upload is taking too long or the server is offline. Please refresh and try again.' })
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
                <h2 className="text-xl font-bold mb-4">Upload Knowledge Base</h2>

                <p className="text-sm text-gray-600 mb-4">
                    Upload PDF or Text files to train the chatbot.
                </p>

                <div className="mb-4">
                    <input
                        type="file"
                        accept=".pdf,.txt"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
                    />
                </div>

                {message && (
                    <div className={`mb-4 p-2 text-sm rounded ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                        {message.text}
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                        disabled={uploading}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 
              ${(!file || uploading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                </div>
            </div>
        </div>
    )
}
