import { useState, useRef, useEffect } from 'react'
import { useFolderChat } from '../queries'
import { SourceCard } from './source-card'
import type { ChatSource } from './source-card'
import { formatDiagnosticsMessage } from '../lib/format-chat-diagnostics'

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
        <h2 className="text-ink text-sm font-semibold">Folder AI Chat</h2>
        <p className="text-graphite mt-0.5 text-xs">폴더: {folderId}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-graphite text-sm">이 폴더에 속한 PDF들을 함께 검색해 답변합니다.</p>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div key={index}>
                <div className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    data-testid={
                      msg.role === 'user'
                        ? 'folder-chat-user-message'
                        : 'folder-chat-assistant-message'
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
                    {msg.sources.map((source, sourceIndex) => (
                      <SourceCard key={sourceIndex} source={source} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatMutation.isPending && <div className="text-graphite text-sm">Thinking...</div>}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-fog border-t p-4">
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
            className="border-steel focus:border-primary flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={handleSubmit}
            disabled={chatMutation.isPending || !input.trim()}
            className="bg-primary hover:bg-primary-deep rounded-lg px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
