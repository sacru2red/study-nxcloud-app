import { useState, useRef, useEffect } from 'react'
import { useChat } from '../queries'
import { SourceCard } from './source-card'
import type { ChatSource } from './source-card'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
}

export interface ChatPanelProps {
  fileId: string | null
  fileName: string | null
  indexStatus: string | null
  onPageNavigate?: (pageNo: number) => void
}

export function ChatPanel({ fileId, fileName, indexStatus, onPageNavigate }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const chatMutation = useChat(fileId ?? '')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isDisabled = !fileId || indexStatus !== 'COMPLETED'

  const getPlaceholder = () => {
    if (!fileId) return 'Select a file to start chatting'
    if (indexStatus === 'PENDING' || indexStatus === 'PROCESSING') {
      return 'File is being indexed...'
    }
    if (indexStatus === 'FAILED') return 'File indexing failed'
    return 'Ask a question about this document...'
  }

  const handleSubmit = () => {
    if (!input.trim() || !fileId || isDisabled) return

    const question = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: question }])

    chatMutation.mutate(question, {
      onSuccess: (res) => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: res.answer,
            sources: res.sources,
          },
        ])
      },
      onError: () => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Sorry, an error occurred while processing your question.',
          },
        ])
      },
    })
  }

  return (
    <div className="flex w-96 flex-col border-l bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">AI Chat</h2>
        {fileName && <p className="mt-0.5 text-xs text-gray-400">{fileName}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            {isDisabled ? (
              <div className="text-center">
                {indexStatus === 'PENDING' || indexStatus === 'PROCESSING' ? (
                  <div className="flex flex-col items-center gap-2">
                    <svg
                      className="h-6 w-6 animate-spin text-blue-400"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <p className="text-sm text-gray-400">{getPlaceholder()}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">{getPlaceholder()}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">{getPlaceholder()}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i}>
                <div className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={
                      msg.role === 'user'
                        ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-blue-500 px-4 py-2 text-sm text-white'
                        : 'max-w-[80%] rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2 text-sm text-gray-800'
                    }
                  >
                    {msg.content}
                  </div>
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.sources.map((source, j) => (
                      <SourceCard key={j} source={source} onPageClick={onPageNavigate} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2 text-sm text-gray-400">
                  <span className="flex items-center gap-1">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Thinking...
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder={getPlaceholder()}
            disabled={isDisabled || chatMutation.isPending}
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            onClick={handleSubmit}
            disabled={isDisabled || chatMutation.isPending || !input.trim()}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chatMutation.isPending ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
