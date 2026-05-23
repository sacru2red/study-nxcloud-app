import { useState, useRef, useEffect } from 'react'
import { useFolderChat } from '../queries'
import { SourceCard } from './source-card'
import type { ChatSource } from './source-card'

interface FolderChatSource extends ChatSource {
  documentId?: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: FolderChatSource[]
  diagnosticsReason?: string
}

export interface FolderChatPanelProps {
  folderId: string
  tenantId: string
}

export function FolderChatPanel({ folderId, tenantId }: FolderChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const chatMutation = useFolderChat(folderId)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMessages([])
    setInput('')
  }, [folderId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = () => {
    if (!input.trim() || !folderId) return

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
            sources: res.sources?.map((source) => ({
              fileName: source.fileName,
              pageNo: source.pageNo,
              paragraphNo: source.paragraphNo,
              text: source.text,
              similarity: source.similarity,
            })),
            diagnosticsReason: undefined,
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
        <h2 className="text-sm font-semibold text-ink">Folder AI Chat</h2>
        <p className="mt-0.5 text-xs text-graphite">폴더: {folderId}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-graphite">
            이 폴더에 속한 PDF들을 함께 검색해 답변합니다.
          </p>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div key={index}>
                <div className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={
                      msg.role === 'user'
                        ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-white'
                        : 'max-w-[80%] rounded-2xl rounded-bl-sm bg-fog px-4 py-2 text-sm text-ink'
                    }
                  >
                    {msg.content}
                  </div>
                </div>
                {msg.diagnosticsReason && (
                  <p className="mt-1 text-xs text-accent-sale">진단: {msg.diagnosticsReason}</p>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.sources.map((source, sourceIndex) => (
                      <SourceCard key={sourceIndex} source={source} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="text-sm text-graphite">Thinking...</div>
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
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Ask about documents in this folder..."
            disabled={chatMutation.isPending}
            className="flex-1 rounded-lg border border-steel px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={handleSubmit}
            disabled={chatMutation.isPending || !input.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary-deep disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
