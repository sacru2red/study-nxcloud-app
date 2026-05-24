import { useState, useRef, useEffect } from 'react'
import { useChat } from '../queries'
import { SourceCard } from './source-card'
import type { ChatSource } from './source-card'
import type { PdfBbox } from '../lib/pdf-bbox'
import { formatDiagnosticsMessage } from '../lib/format-chat-diagnostics'
import { IndexProgressDisplay, type IndexProgressData } from './index-progress-display'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
  diagnosticsReason?: string
}

export interface ChatPanelProps {
  fileId: string | null
  fileName: string | null
  indexStatus: string | null
  indexProgress?: IndexProgressData | null
  onPageNavigate?: (pageNo: number, bbox?: PdfBbox) => void
}

export function ChatPanel({
  fileId,
  fileName,
  indexStatus,
  indexProgress,
  onPageNavigate,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const chatMutation = useChat(fileId ?? '')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastUserMessageRef = useRef<HTMLDivElement>(null)

  const lastUserMessageIndex = messages.reduce(
    (lastIndex, message, index) => (message.role === 'user' ? index : lastIndex),
    -1,
  )

  useEffect(() => {
    if (messages.length === 0) return

    if (chatMutation.isPending) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'assistant' && lastUserMessageRef.current) {
      lastUserMessageRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatMutation.isPending])

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
            diagnosticsReason: res.diagnostics?.reason,
          },
        ])
      },
      onError: () => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '질문 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
            diagnosticsReason: 'REQUEST_FAILED',
          },
        ])
      },
    })
  }

  return (
    <div className="bg-canvas flex min-h-0 flex-1 flex-col">
      <div className="border-fog border-b px-4 py-3">
        <h2 className="text-ink text-sm font-semibold">AI Chat</h2>
        {fileName && <p className="text-graphite mt-0.5 text-xs">{fileName}</p>}
        {indexProgress &&
          (indexStatus === 'PENDING' ||
            indexStatus === 'PROCESSING' ||
            indexStatus === 'FAILED') && (
            <div className="mt-2">
              <IndexProgressDisplay progress={indexProgress} />
            </div>
          )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            {isDisabled ? (
              <div className="text-center">
                {indexStatus === 'PENDING' || indexStatus === 'PROCESSING' ? (
                  <div className="flex flex-col items-center gap-2">
                    <svg
                      className="text-primary-bright h-6 w-6 animate-spin"
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
                    <p className="text-graphite text-sm">
                      {indexProgress?.message ?? getPlaceholder()}
                    </p>
                  </div>
                ) : (
                  <p className="text-graphite text-sm">
                    {indexProgress?.message ?? getPlaceholder()}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-graphite text-sm">{getPlaceholder()}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i}>
                <div className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    ref={i === lastUserMessageIndex ? lastUserMessageRef : undefined}
                    data-testid={
                      msg.role === 'user' ? 'chat-user-message' : 'chat-assistant-message'
                    }
                    className={
                      msg.role === 'user'
                        ? 'bg-primary max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2 text-sm text-white'
                        : 'bg-fog text-ink max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-2 text-sm'
                    }
                  >
                    {msg.content}
                  </div>
                </div>
                {formatDiagnosticsMessage(msg.diagnosticsReason) && (
                  <p className="text-accent-sale mt-1 text-xs">
                    {formatDiagnosticsMessage(msg.diagnosticsReason)}
                  </p>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.sources.map((source, j) => (
                      <SourceCard key={j} source={source} onSourceClick={onPageNavigate} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-fog text-graphite rounded-2xl rounded-bl-sm px-4 py-2 text-sm">
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

      <div className="border-fog border-t p-4">
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
            className="border-steel focus:border-primary disabled:bg-cloud disabled:text-graphite flex-1 rounded-lg border px-3 py-2 text-sm outline-none disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSubmit}
            disabled={isDisabled || chatMutation.isPending || !input.trim()}
            className="bg-primary hover:bg-primary-deep rounded-lg px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
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
