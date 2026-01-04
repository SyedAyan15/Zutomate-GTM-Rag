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
            const { createClient } = await import('../../lib/supabase/client')
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
            const { createClient } = await import('../../lib/supabase/client')
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
                <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-4xl bg-slate-50 min-h-full">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Settings</h2>
                <p className="text-sm text-gray-500 font-medium">Global configuration for your Zutomate AI Agent</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-8">
                {/* System Prompt Section */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        System Prompt
                    </label>
                    <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                        This instruction defines the core personality and behavior of the Zutomate agent. Use this to set the tone, expertise, and operational boundaries.
                    </p>
                    <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={10}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all bg-gray-50 text-gray-900 placeholder-gray-400 font-mono text-sm"
                        placeholder="e.g. You are Zutomate, a specialized Go-to Market AI Assistant..."
                    />
                </div>

                {/* Model Info Section */}
                <div className="pt-6 border-t border-gray-100">
                    <label className="block text-sm font-bold text-gray-700 mb-4">
                        AI Engine Configuration
                    </label>
                    <div className="bg-[#0A192F]/5 px-6 py-4 rounded-xl border border-[#0A192F]/10 flex items-center justify-between">
                        <div>
                            <span className="text-sm font-semibold text-[#0A192F]">Current Model</span>
                            <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1">High-Performance LLM</p>
                        </div>
                        <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100">
                            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                            <span className="text-sm font-bold text-gray-900">GPT-4o</span>
                        </div>
                    </div>
                </div>

                {/* Message Display */}
                {message && (
                    <div className={`p-4 rounded-xl border-l-4 font-medium text-sm transition-all ${message.type === 'success'
                        ? 'bg-green-50 text-green-700 border-green-500'
                        : 'bg-red-50 text-red-700 border-red-500'
                        }`}>
                        <div className="flex items-center">
                            <span className="mr-2">{message.type === 'success' ? '✅' : '⚠️'}</span>
                            {message.text}
                        </div>
                    </div>
                )}

                {/* Save Button */}
                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-3 bg-[#0A192F] text-white font-bold rounded-xl hover:bg-[#112240] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-gray-200 transform active:scale-95"
                    >
                        {saving ? (
                            <span className="flex items-center">
                                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Saving Changes...
                            </span>
                        ) : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}
