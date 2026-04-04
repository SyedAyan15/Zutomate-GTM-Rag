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
    <div className="flex items-center justify-center h-full text-[var(--muted)]">
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
               "relative group",
               message.role === 'user' ? 'bubble-user' : 'bubble-assistant'
            )}
          >
            <div
              className={cn(
                "prose prose-invert prose-sm md:prose-base break-words prose-p:text-inherit prose-headings:text-inherit prose-strong:text-white"
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
                "text-[10px] mt-2 text-right font-medium",
                message.role === 'user' ? 'text-[var(--white)] opacity-60' : 'text-[var(--muted)]'
              )}
            >
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))
      }
      {loading && (
          <div className="flex justify-start">
            <div className="bubble-assistant">
              <div className="flex space-x-2 py-1">
                <div className="typing-dot" style={{ animationDelay: '0s' }}></div>
                <div className="typing-dot" style={{ animationDelay: '0.2s' }}></div>
                <div className="typing-dot" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )}
    </div >
  )
}

