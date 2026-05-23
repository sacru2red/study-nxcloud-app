import { useMemo, useState, useRef } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAtom } from 'jotai'
import { userAtom, isAuthenticatedAtom } from '../stores/auth'
import { selectedFileIdAtom } from '../stores/files'
import { useFiles, useUploadFile, useProcessingIndexStatuses, useRetryIndex } from '../queries'
import { PdfViewer } from '../components/pdf-viewer'
import { ChatPanel } from '../components/chat-panel'
import { FolderChatPanel } from '../components/folder-chat-panel'
import { DocumentFileListItem } from '../components/document-file-list-item'
import { groupDocumentsByFolder } from '../lib/group-documents-by-folder'
import { legacyStatusFromProgress } from '../lib/index-status-label'

type ChatMode = 'document' | 'folder'

export function MainPage() {
  const [isAuth] = useAtom(isAuthenticatedAtom)
  const [user] = useAtom(userAtom)
  const [selectedFileId, setSelectedFileId] = useAtom(selectedFileIdAtom)
  const [targetPage, setTargetPage] = useState<number | null>(null)
  const [chatMode, setChatMode] = useState<ChatMode>('document')
  const [folderName, setFolderName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: docs, isLoading } = useFiles(user?.tenantId)
  const uploadMutation = useUploadFile(user?.tenantId)
  const retryMutation = useRetryIndex()

  const selectedDoc = docs?.find((d) => d.documentId === selectedFileId)

  const folderGroups = useMemo(() => groupDocumentsByFolder(docs ?? []), [docs])

  const handleSelectFile = (docId: string, docFolderId: string | null) => {
    setSelectedFileId(docId)
    setTargetPage(null)
    if (docFolderId?.trim()) {
      setFolderName(docFolderId.trim())
    }
  }

  const handleSelectFolder = (name: string) => {
    setFolderName(name)
    setChatMode('folder')
  }

  const handleDownloadFile = (downloadUrl: string | null, fileName: string) => {
    if (!downloadUrl) {
      return
    }

    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = fileName
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const processingDocumentIds = useMemo(
    () =>
      docs
        ?.filter(
          (d) =>
            d.indexStatus === 'PENDING' ||
            d.indexStatus === 'PROCESSING' ||
            d.indexStatus === 'FAILED',
        )
        .map((d) => d.documentId) ?? [],
    [docs],
  )

  const progressByDocumentId = useProcessingIndexStatuses(processingDocumentIds)

  const selectedProgress = selectedFileId
    ? progressByDocumentId.get(selectedFileId)
    : undefined

  const currentIndexStatus = legacyStatusFromProgress(
    selectedProgress,
    selectedDoc?.indexStatus ?? '',
  )

  if (!isAuth) return <Navigate to="/login" />

  return (
    <div className="flex flex-[0] h-[1px]">
      <aside className="w-72 flex-shrink-0 overflow-y-auto border-r border-fog bg-cloud p-4 flex flex-col h-auto max-h-screen">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              uploadMutation.mutate({
                file,
                folderId: folderName.trim() || undefined,
              })
            }
            e.target.value = ''
          }}
        />
        <section className="mb-4 rounded-lg border border-fog bg-canvas p-3 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-graphite">
            PDF 업로드
          </h2>
          <label className="mb-3 block text-xs text-charcoal">
            폴더 이름 (선택)
            <input
              type="text"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              className="mt-1 w-full rounded-md border border-fog px-2 py-1.5 text-sm text-ink"
              placeholder="예: 2024-계약"
            />
          </label>
          <p className="mb-3 text-[11px] leading-relaxed text-graphite">
            같은 폴더 이름으로 올린 PDF는 아래에서 한 묶음으로 보이고, 폴더 채팅에서 함께 검색됩니다.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="flex w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-steel p-3 text-sm text-charcoal hover:border-primary hover:text-primary-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadMutation.isPending ? '업로드 중...' : '+ Upload PDF'}
          </button>
          {uploadMutation.isError && (
            <div className="mt-2 rounded bg-primary-soft p-2 text-xs text-error">업로드 실패</div>
          )}
        </section>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-graphite">Loading...</div>
        ) : !docs || docs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-fog bg-canvas py-8 text-center text-sm text-graphite">
            아직 파일이 없습니다
          </div>
        ) : (
          <div className="space-y-3">
            {folderGroups.map((group) => {
              const isActiveFolder =
                group.folderKey !== null && folderName.trim() === group.folderKey

              return (
                <section
                  key={group.folderKey ?? '__unfiled__'}
                  className={
                    'overflow-hidden rounded-lg border bg-canvas shadow-sm' +
                    (isActiveFolder ? ' border-primary-bright ring-1 ring-primary-soft' : ' border-fog')
                  }
                >
                  {group.folderKey !== null ? (
                    <button
                      type="button"
                      onClick={() => handleSelectFolder(group.label)}
                      className="flex w-full items-center justify-between border-b border-fog bg-cloud px-3 py-2 text-left hover:bg-primary-ghost"
                    >
                      <span className="truncate text-sm font-semibold text-ink">
                        {group.label}
                      </span>
                      <span className="ml-2 shrink-0 text-xs text-graphite">{group.documents.length}개</span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between border-b border-fog bg-cloud px-3 py-2">
                      <span className="text-sm font-semibold text-charcoal">{group.label}</span>
                      <span className="text-xs text-graphite">{group.documents.length}개</span>
                    </div>
                  )}
                  <ul className="space-y-1.5 p-2">
                    {group.documents.map((doc) => (
                      <DocumentFileListItem
                        key={doc.documentId}
                        doc={doc}
                        isSelected={selectedFileId === doc.documentId}
                        displayIndexStatus={legacyStatusFromProgress(
                          progressByDocumentId.get(doc.documentId),
                          doc.indexStatus,
                        )}
                        indexProgress={progressByDocumentId.get(doc.documentId)}
                        isRetryPending={retryMutation.isPending}
                        onSelect={(documentId) =>
                          handleSelectFile(documentId, doc.folderId)
                        }
                        onDownload={handleDownloadFile}
                        onRetry={(documentId) => retryMutation.mutate(documentId)}
                      />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </aside>

      {chatMode === 'document' ? (
        <PdfViewer
          fileId={selectedDoc?.documentId ?? null}
          fileName={selectedDoc?.fileName ?? null}
          targetPage={targetPage}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-cloud text-sm text-graphite">
          폴더 채팅 모드 — PDF 뷰어는 문서 모드에서 사용합니다.
        </div>
      )}

      <div className="flex w-96 flex-col border-l border-fog bg-canvas">
        <div className="flex border-b border-fog">
          <button
            type="button"
            onClick={() => setChatMode('document')}
            className={
              'flex-1 px-3 py-2 text-sm' +
              (chatMode === 'document' ? ' border-b-2 border-primary font-medium text-primary-deep' : ' text-graphite')
            }
          >
            문서 채팅
          </button>
          <button
            type="button"
            onClick={() => setChatMode('folder')}
            className={
              'flex-1 px-3 py-2 text-sm' +
              (chatMode === 'folder' ? ' border-b-2 border-primary font-medium text-primary-deep' : ' text-graphite')
            }
          >
            폴더 채팅
          </button>
        </div>
        {chatMode === 'document' ? (
          <ChatPanel
            fileId={selectedFileId}
            fileName={selectedDoc?.fileName ?? null}
            indexStatus={currentIndexStatus || null}
            indexProgress={selectedProgress}
            onPageNavigate={(page) => setTargetPage(page)}
          />
        ) : user?.tenantId ? (
          folderName.trim() ? (
            <FolderChatPanel folderId={folderName.trim()} tenantId={user.tenantId} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-graphite">
              왼쪽에서 폴더 이름을 입력하거나, 폴더 카드 제목을 클릭한 뒤 질문하세요.
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}
