'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase/client'
import UploadModal from '../Chat/UploadModal'

interface UploadedFile {
    id: string
    filename: string
    file_size: number
    uploaded_at: string
    uploaded_by: string
    chunk_count: number
    file_type: string
    profiles?: {
        email?: string
        username?: string
    }
}

export default function KnowledgeBase() {
    const [files, setFiles] = useState<UploadedFile[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        loadFiles()
    }, [])

    const loadFiles = async () => {
        try {
            setLoading(true)

            // Use Supabase Client directly to bypass API route cookie issues
            // RLS policies will ensure security (Admin only)
            const { data, error } = await supabase
                .from('uploaded_files')
                .select('*')
                .order('uploaded_at', { ascending: false })

            if (error) {
                console.error('Supabase fetch error:', error)
                throw error
            }

            setFiles(data || [])
            setError(null)
        } catch (error: any) {
            console.error('Error loading files:', error)
            setError(error.message || 'Failed to load files from database')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (fileId: string, filename: string) => {
        if (!confirm(`Are you sure you want to delete "${filename}"? This will remove it from the knowledge base.`)) {
            return
        }

        try {
            setDeleting(fileId)
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const response = await fetch(`/api/files?id=${fileId}&filename=${encodeURIComponent(filename)}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (response.ok) {
                setFiles(files.filter(f => f.id !== fileId))
            } else {
                const data = await response.json()
                alert(`Failed to delete file: ${data.error}`)
            }
        } catch (error) {
            console.error('Delete error:', error)
            alert('Failed to delete file')
        } finally {
            setDeleting(null)
        }
    }

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 bg-slate-50 min-h-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Knowledge Base</h2>
                    <p className="text-sm text-gray-500 font-medium">Manage and monitor document indexing for Zutomate</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={loadFiles}
                        className="px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm flex items-center"
                    >
                        <span className="mr-2">🔄</span> Refresh
                    </button>
                    <button
                        onClick={() => setIsUploadModalOpen(true)}
                        className="px-6 py-2.5 text-sm font-bold text-white bg-[#0A192F] hover:bg-[#112240] rounded-xl transition-all shadow-lg shadow-gray-200 active:scale-95 flex items-center"
                    >
                        <span className="mr-2">➕</span> Upload Document
                    </button>
                </div>
            </div>

            {error ? (
                <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-r-xl mb-6 shadow-sm">
                    <p className="font-bold flex items-center">
                        <span className="mr-2">⚠️</span> Error
                    </p>
                    <p className="text-sm opacity-90">{error}</p>
                </div>
            ) : files.length === 0 ? (
                <div className="text-center py-20 bg-white border border-dashed border-gray-300 rounded-2xl shadow-sm">
                    <div className="text-4xl mb-4">📂</div>
                    <p className="text-gray-600 font-bold text-lg">No documents found</p>
                    <p className="text-sm text-gray-400 mt-2 max-w-xs mx-auto">Upload files to populate the knowledge base and start chatting with your data.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Filename
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Size
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Chunks
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Uploaded
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {files.map((file) => (
                                <tr key={file.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="text-sm font-medium text-gray-900">{file.filename}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatFileSize(file.file_size)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {file.chunk_count}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatDate(file.uploaded_at)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <button
                                            onClick={() => handleDelete(file.id, file.filename)}
                                            disabled={deleting === file.id}
                                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                                        >
                                            {deleting === file.id ? 'Deleting...' : 'Delete'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => {
                    setIsUploadModalOpen(false)
                    loadFiles() // Refresh after close
                }}
            />
        </div>
    )
}
