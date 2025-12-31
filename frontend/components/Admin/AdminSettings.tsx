'use client'

import { useState, useEffect } from 'react'

export default function AdminSettings() {
    const [systemPrompt, setSystemPrompt] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    useEffect(() => {
        loadSettings()
    }, [])

    const loadSettings = async () => {
        try {
            setLoading(true)

            // Get session token for Auth
            const { createClient } = await import('@/lib/supabase/client')
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const response = await fetch('/api/settings', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            const data = await response.json()

            if (response.ok) {
                setSystemPrompt(data.system_prompt || '')
            } else {
                console.error('Failed to load settings:', data.error)
            }
        } catch (error) {
            console.error('Error loading settings:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        if (!systemPrompt.trim()) {
            setMessage({ type: 'error', text: 'System prompt cannot be empty' })
            return
        }

        try {
            setSaving(true)
            setMessage(null)

            // Get session token for Auth
            const { createClient } = await import('@/lib/supabase/client')
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const response = await fetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ system_prompt: systemPrompt })
            })

            const data = await response.json()

            if (response.ok) {
                setMessage({ type: 'success', text: 'System prompt updated successfully!' })
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to update system prompt' })
            }
        } catch (error) {
            console.error('Save error:', error)
            setMessage({ type: 'error', text: 'Failed to save settings' })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-4xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">System Settings</h2>

            <div className="bg-white rounded-lg shadow p-6 space-y-6">
                {/* System Prompt Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        System Prompt
                    </label>
                    <p className="text-sm text-gray-500 mb-3">
                        This prompt is applied to all chat conversations for all users. It defines the AI's behavior and personality.
                    </p>
                    <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter the system prompt..."
                    />
                </div>

                {/* Model Info Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        AI Model
                    </label>
                    <div className="bg-gray-50 px-4 py-3 rounded-lg">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Current Model:</span>
                            <span className="text-sm font-semibold text-gray-900">GPT-4o</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Using OpenAI's most advanced model for all users
                        </p>
                    </div>
                </div>

                {/* Message Display */}
                {message && (
                    <div className={`p-4 rounded-lg ${message.type === 'success'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                        }`}>
                        {message.text}
                    </div>
                )}

                {/* Save Button */}
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}
