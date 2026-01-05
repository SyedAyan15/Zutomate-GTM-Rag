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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0A192F]/80 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden transform transition-all border border-gray-100">
                {/* Header */}
                <div className="bg-[#0A192F] px-8 py-6 relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-500"></div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Upload Knowledge</h2>
                    <p className="text-sm text-gray-400 mt-1">Enhance Zutomate with your documents</p>
                </div>

                <div className="p-8">
                    <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                        Upload your business documents (PDF or Text). Zutomate will index them to provide specialized GTM insights.
                    </p>

                    <div className="mb-6">
                        <label className="block w-full cursor-pointer group">
                            <div className={`border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center space-y-3 ${file ? 'border-orange-500 bg-orange-50/30' : 'border-gray-200 hover:border-orange-400 hover:bg-gray-50'
                                }`}>
                                <div className={`text-3xl transition-transform group-hover:scale-110 ${file ? 'text-orange-500' : 'text-gray-400'}`}>
                                    {file ? '📄' : '📤'}
                                </div>
                                <span className={`text-sm font-bold ${file ? 'text-orange-700' : 'text-gray-500'}`}>
                                    {file ? file.name : 'Select PDF or Text File'}
                                </span>
                                {file && (
                                    <span className="text-[10px] text-orange-400 uppercase font-black tracking-widest">
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
                            className="flex-1 px-4 py-3 text-gray-500 font-bold text-sm hover:bg-gray-100 rounded-xl transition-all active:scale-95"
                            disabled={uploading}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            className={`flex-[2] py-3 px-4 bg-[#0A192F] text-white font-bold rounded-xl transition-all shadow-lg shadow-gray-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${!file ? '' : 'hover:bg-[#112240]'
                                }`}
                        >
                            {uploading ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
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
