'use client'

import type { Message } from '../../lib/types'

interface MessageListProps {
  messages: Message[]
  loading: boolean
}

export default function MessageList({ messages, loading }: MessageListProps) {
  if (messages.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>Start a conversation by sending a message below.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
        >
          <div
            className={`max-w-xs lg:max-w-md px-5 py-3 rounded-2xl shadow-sm ${message.role === 'user'
              ? 'bg-[#0A192F] text-white border-b-2 border-orange-500 rounded-tr-none'
              : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
              }`}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
            <p
              className={`text-[10px] mt-2 opacity-60 ${message.role === 'user' ? 'text-orange-200' : 'text-gray-400'
                }`}
            >
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}
      {loading && (
        <div className="flex justify-start">
          <div className="bg-white border border-gray-100 px-5 py-3 rounded-2xl rounded-tl-none shadow-sm">
            <div className="flex space-x-2">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

