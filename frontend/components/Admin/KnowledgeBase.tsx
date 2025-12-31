'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        )
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">System Knowledge Base</h2>
                    <p className="text-sm text-gray-500 font-medium">Manage and monitor document indexing for RAG sessions</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={loadFiles}
                        className="px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm"
                    >
                        🔄 Refresh List
                    </button>
                    <button
                        onClick={() => setIsUploadModalOpen(true)}
                        className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-200 active:scale-95"
                    >
                        ➕ Upload New Document
                    </button>
                </div>
            </div>

            {error ? (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
                    <strong className="font-bold">Error:</strong> <span className="block sm:inline">{error}</span>
                </div>
            ) : files.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <p className="text-gray-600">No files uploaded yet</p>
                    <p className="text-sm text-gray-500 mt-2">Upload files using the "+ Upload New Document" button above.</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
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
