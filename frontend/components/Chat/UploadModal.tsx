'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase/client'

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
        setMessage(null)

        try {
            const { data: { session } } = await supabase.auth.getSession()
            const headers: Record<string, string> = {}
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`
            }

            const formData = new FormData()
            formData.append('file', file)

            // --- TIMEOUT PROTECTION (Increased to 5 minutes for RAG indexing) ---
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 300000)

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
                return
            }

            if (!response.ok) {
                throw new Error(data.details || data.error || `Upload failed (${response.status})`)
            }

            setMessage({ type: 'success', text: 'File uploaded and processed successfully!' })
            if (onSuccess) onSuccess()

            setTimeout(() => {
                onClose()
                setMessage(null)
                setFile(null)
            }, 2000)
        } catch (error: any) {
            console.error('Upload error:', error)
            const isAbort = error.name === 'AbortError'
            setMessage({
                type: 'error',
                text: isAbort
                    ? 'The upload and indexing process timed out (5m). The file might still be processing on the server, please check the list in a moment.'
                    : (error.message || 'An unexpected error occurred during upload.')
            })
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="card-default w-full max-w-md !p-0 overflow-hidden relative border-none">
                {/* Header */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-[var(--orange)] z-10"></div>
                <div className="bg-[var(--navy-card)] border-b border-[var(--border)] px-8 py-6 relative">
                    <h2 className="text-xl tracking-tight text-[var(--white)]">Upload Knowledge</h2>
                    <p className="text-sm text-[var(--muted)] mt-1">Enhance Zutomate with your documents</p>
                </div>

                <div className="p-8">
                    <p className="text-sm text-[var(--muted)] mb-6 leading-relaxed">
                        Upload your business documents (PDF or Text). Zutomate will index them to provide specialized GTM insights.
                    </p>

                    <div className="mb-6">
                        <label className="block w-full cursor-pointer group">
                            <div className={`border border-dashed rounded-xl p-8 transition-hover flex flex-col items-center justify-center space-y-3 ${file ? 'border-[var(--orange)] bg-[var(--orange-dim)]/20' : 'border-[var(--border-hi)] hover:border-[var(--orange)] bg-transparent'
                                }`}>
                                <div className={`text-3xl transition-transform group-hover:scale-110 ${file ? 'text-[var(--orange)]' : 'opacity-50'}`}>
                                    {file ? '📄' : '📤'}
                                </div>
                                <span className={`text-sm font-bold ${file ? 'text-[var(--white)]' : 'text-[var(--muted)]'}`}>
                                    {file ? file.name : 'Select PDF or Text File'}
                                </span>
                                {file && (
                                    <span className="small-label text-[var(--orange)] mt-1">
                                        {(file.size / 1024).toFixed(1)} KB
                                    </span>
                                )}
                            </div>
                            <input
                                type="file"
                                accept=".pdf,.txt"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </label>
                    </div>

                    {message && (
                        <div className={`mb-6 p-4 rounded-xl border-l-4 font-medium text-xs transition-all animate-in fade-in slide-in-from-top-2 ${message.type === 'success'
                                ? 'bg-green-50 text-green-700 border-green-500'
                                : 'bg-red-50 text-red-700 border-red-500'
                            }`}>
                            <div className="flex items-start">
                                <span className="mr-2 mt-0.5">{message.type === 'success' ? '✅' : '⚠️'}</span>
                                <span className="flex-1">{message.text}</span>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="btn-secondary !w-auto flex-1 flex items-center justify-center"
                            disabled={uploading}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            className="btn-primary !w-auto flex-[2] flex justify-center items-center disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            {uploading ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-[var(--white)]" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Indexing...
                                </span>
                            ) : 'Start Indexing'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
