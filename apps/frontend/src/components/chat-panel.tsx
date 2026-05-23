import { useState, useRef, useEffect } from 'react'
import { useChat } from '../queries'
import { SourceCard } from './source-card'
import type { ChatSource } from './source-card'
import { IndexProgressDisplay, type IndexProgressData } from './index-progress-display'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
  diagnosticsReason?: string
}

function formatDiagnosticsMessage(reason: string | undefined): string | undefined {
  if (!reason) return undefined
  const labels: Record<string, string> = {
    NO_RELEVANT_CHUNKS: '관련 문서 구간을 찾지 못했습니다.',
    EMBEDDING_FAILED: '질문 임베딩에 실패했습니다.',
    LLM_API_FAILED: 'LLM API 호출에 실패했습니다.',
    REQUEST_FAILED: '요청 처리에 실패했습니다.',
  }
  return labels[reason] ?? reason
}

export interface ChatPanelProps {
  fileId: string | null
  fileName: string | null
  indexStatus: string | null
  indexProgress?: IndexProgressData | null
  onPageNavigate?: (pageNo: number) => void
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
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <div className="border-b border-fog px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">AI Chat</h2>
        {fileName && <p className="mt-0.5 text-xs text-graphite">{fileName}</p>}
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
                      className="h-6 w-6 animate-spin text-primary-bright"
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
                    <p className="text-sm text-graphite">
                      {indexProgress?.message ?? getPlaceholder()}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-graphite">
                    {indexProgress?.message ?? getPlaceholder()}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-graphite">{getPlaceholder()}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i}>
                <div className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    ref={i === lastUserMessageIndex ? lastUserMessageRef : undefined}
                    className={
                      msg.role === 'user'
                        ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-white'
                        : 'max-w-[80%] rounded-2xl rounded-bl-sm bg-fog px-4 py-2 text-sm text-ink'
                    }
                  >
                    {msg.content}
                  </div>
                </div>
                {formatDiagnosticsMessage(msg.diagnosticsReason) && (
                  <p className="mt-1 text-xs text-accent-sale">
                    {formatDiagnosticsMessage(msg.diagnosticsReason)}
                  </p>
                )}
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
                <div className="rounded-2xl rounded-bl-sm bg-fog px-4 py-2 text-sm text-graphite">
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

      <div className="border-t border-fog p-4">
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
            className="flex-1 rounded-lg border border-steel px-3 py-2 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-cloud disabled:text-graphite"
          />
          <button
            onClick={handleSubmit}
            disabled={isDisabled || chatMutation.isPending || !input.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-50"
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
