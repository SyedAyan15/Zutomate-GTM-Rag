'use client'

import type { Message } from '../../lib/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../lib/utils'

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
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={cn(
              "max-w-[92%] md:max-w-[85%] lg:max-w-[75%] px-4 md:px-5 py-3 md:py-4 rounded-2xl shadow-sm transition-all",
              message.role === 'user'
                ? 'bg-[#0A192F] text-white border-b-2 border-orange-500 rounded-tr-none ml-auto'
                : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none mr-auto'
            )}
          >
            <div
              className={cn(
                "prose prose-sm leading-relaxed break-words",
                message.role === 'user'
                  ? "prose-invert prose-p:text-white prose-a:text-orange-300 prose-headings:text-white prose-strong:text-orange-200"
                  : "prose-headings:text-[#0A192F] prose-a:text-orange-600 prose-strong:text-[#0A192F] text-gray-800"
              )}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                  a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity font-bold">{children}</a>,
                  ul: ({ children }) => <ul className="list-disc ml-4 mb-3 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal ml-4 mb-3 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="pl-1">{children}</li>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
            <p
              className={cn(
                "text-[10px] mt-2 opacity-60 text-right font-medium",
                message.role === 'user' ? 'text-orange-200' : 'text-gray-400'
              )}
            >
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))
      }
      {
        loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 px-5 py-3 rounded-2xl rounded-tl-none shadow-sm">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  )
}

