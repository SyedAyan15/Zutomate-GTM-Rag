'use client'

import { useState, KeyboardEvent } from 'react'
import { ArrowUp } from 'lucide-react'

interface MessageInputProps {
  onSendMessage: (message: string) => void
  disabled: boolean
}

export default function MessageInput({ onSendMessage, disabled }: MessageInputProps) {
  const [message, setMessage] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !disabled) {
      onSendMessage(message)
      setMessage('')
    }
  }

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="border-t border-gray-100 md:border-t-0 p-2 md:p-0 bg-white md:bg-transparent">
      <form onSubmit={handleSubmit} className="flex items-end space-x-2 max-w-4xl mx-auto">
        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-500 transition-all">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type your message..."
            disabled={disabled}
            rows={1}
            className="w-full px-4 py-3 text-sm md:text-base bg-transparent border-none focus:outline-none text-gray-900 placeholder-gray-400 resize-none min-h-[44px] max-h-32"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || !message.trim()}
          className="p-3 bg-[#0A192F] text-white rounded-xl hover:bg-[#112240] focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg flex items-center justify-center h-[44px] w-[44px]"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
    </div>
  )
}

