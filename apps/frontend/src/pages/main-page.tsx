import { useMemo, useState, useRef } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAtom } from 'jotai'
import { userAtom, isAuthenticatedAtom } from '../stores/auth'
import { selectedFileIdAtom } from '../stores/files'
import {
  useFiles,
  useUploadFile,
  useProcessingIndexStatuses,
  useRetryIndex,
  useQuota,
} from '../queries'
import { PdfViewer } from '../components/pdf-viewer'
import { ChatPanel } from '../components/chat-panel'
import { FolderChatPanel } from '../components/folder-chat-panel'
import { DocumentFileListItem } from '../components/document-file-list-item'
import {
  formatBytes,
  getApiErrorMessage,
  getRemainingBytes,
  getUploadQuotaMessage,
  isQuotaExceeded,
  isQuotaWarning,
} from '../lib/quota.util'
import { groupDocumentsByFolder } from '../lib/group-documents-by-folder'
import { legacyStatusFromProgress } from '../lib/index-status-label'
import type { PdfBbox } from '../lib/pdf-bbox'

type ChatMode = 'document' | 'folder'

export function MainPage() {
  const [isAuth] = useAtom(isAuthenticatedAtom)
  const [user] = useAtom(userAtom)
  const [selectedFileId, setSelectedFileId] = useAtom(selectedFileIdAtom)
  const [targetPage, setTargetPage] = useState<number | null>(null)
  const [highlightBbox, setHighlightBbox] = useState<PdfBbox | null>(null)
  const [chatMode, setChatMode] = useState<ChatMode>('document')
  const [folderName, setFolderName] = useState('')
  const [uploadQuotaMessage, setUploadQuotaMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: docs, isLoading } = useFiles(user?.tenantId)
  const { data: quota } = useQuota(!!user)
  const uploadMutation = useUploadFile(user?.tenantId)
  const retryMutation = useRetryIndex()

  const selectedDoc = docs?.find((d) => d.documentId === selectedFileId)

  const folderGroups = useMemo(() => groupDocumentsByFolder(docs ?? []), [docs])

  const handleSelectFile = (docId: string, docFolderId: string | null) => {
    setSelectedFileId(docId)
    setTargetPage(null)
    setHighlightBbox(null)
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

  const selectedProgress = selectedFileId ? progressByDocumentId.get(selectedFileId) : undefined

  const currentIndexStatus = legacyStatusFromProgress(
    selectedProgress,
    selectedDoc?.indexStatus ?? '',
  )

  const quotaExceeded = quota !== undefined && isQuotaExceeded(quota.usedBytes, quota.quotaBytes)
  const quotaNearLimit = quota !== undefined && isQuotaWarning(quota.usedBytes, quota.quotaBytes)
  const remainingBytes =
    quota !== undefined ? getRemainingBytes(quota.usedBytes, quota.quotaBytes) : null

  const handleUploadClick = () => {
    setUploadQuotaMessage(null)
    if (quotaExceeded) {
      setUploadQuotaMessage(
        getUploadQuotaMessage(quota!.usedBytes, quota!.quotaBytes, 1) ??
          '저장공간 할당량을 초과하여 업로드할 수 없습니다.',
      )
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileSelected = (file: File) => {
    setUploadQuotaMessage(null)
    if (quota) {
      const message = getUploadQuotaMessage(quota.usedBytes, quota.quotaBytes, file.size)
      if (message) {
        setUploadQuotaMessage(message)
        return
      }
    }

    uploadMutation.mutate(
      {
        file,
        folderId: folderName.trim() || undefined,
      },
      {
        onError: (error) => {
          setUploadQuotaMessage(getApiErrorMessage(error, '업로드에 실패했습니다.'))
        },
      },
    )
  }

  if (!isAuth) return <Navigate to="/login" />

  return (
    <div className="flex h-[1px] flex-[0]">
      <aside className="border-fog bg-cloud flex h-auto max-h-screen w-72 flex-shrink-0 flex-col overflow-y-auto border-r p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              handleFileSelected(file)
            }
            e.target.value = ''
          }}
        />
        <section className="border-fog bg-canvas mb-4 rounded-lg border p-3 shadow-sm">
          <h2 className="text-graphite mb-3 text-xs font-semibold uppercase tracking-wide">
            PDF 업로드
          </h2>
          <label className="text-charcoal mb-3 block text-xs">
            폴더 이름 (선택)
            <input
              type="text"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              className="border-fog text-ink mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
              placeholder="예: 2024-계약"
            />
          </label>
          <p className="text-graphite mb-3 text-[11px] leading-relaxed">
            같은 폴더 이름으로 올린 PDF는 아래에서 한 묶음으로 보이고, 폴더 채팅에서 함께
            검색됩니다.
          </p>
          {quotaNearLimit && remainingBytes !== null && Number.isFinite(remainingBytes) && (
            <div className="border-accent-sale bg-accent-sale-soft text-charcoal mb-3 rounded-md border p-2.5 text-xs">
              저장공간이 거의 찼습니다. 남은 용량 {formatBytes(remainingBytes)} (
              {quota!.usagePercent}% 사용 중)
            </div>
          )}
          {quotaExceeded && (
            <div className="border-semantic-error/30 bg-primary-soft text-semantic-error mb-3 rounded-md border p-2.5 text-xs">
              저장공간 할당량을 모두 사용했습니다. 새 PDF를 업로드할 수 없습니다.
            </div>
          )}
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={uploadMutation.isPending || quotaExceeded}
            className="border-steel text-charcoal hover:border-primary hover:text-primary-deep flex w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadMutation.isPending
              ? '업로드 중...'
              : quotaExceeded
                ? '할당량 초과 — 업로드 불가'
                : '+ Upload PDF'}
          </button>
          {uploadQuotaMessage && (
            <div className="bg-primary-soft text-semantic-error mt-2 rounded p-2 text-xs">
              {uploadQuotaMessage}
            </div>
          )}
          {uploadMutation.isError && !uploadQuotaMessage && (
            <div className="bg-primary-soft text-semantic-error mt-2 rounded p-2 text-xs">
              {getApiErrorMessage(uploadMutation.error, '업로드 실패')}
            </div>
          )}
        </section>

        {retryMutation.isError && (
          <div className="bg-primary-soft text-error mb-3 rounded-lg p-2.5 text-xs">
            재시도 실패:{' '}
            {retryMutation.error instanceof Error
              ? retryMutation.error.message
              : '서버에 연결할 수 없습니다. Docker(Postgres)가 실행 중인지 확인하세요.'}
          </div>
        )}

        {retryMutation.isSuccess && retryMutation.data && (
          <div
            className={
              'mb-3 rounded-lg p-2.5 text-xs' +
              (retryMutation.data.action === 'already_running'
                ? 'bg-storm-mist/30 text-storm-deep'
                : 'bg-storm-mist/30 text-storm-deep')
            }
          >
            {retryMutation.data.message}
          </div>
        )}

        {isLoading ? (
          <div className="text-graphite py-8 text-center text-sm">Loading...</div>
        ) : !docs || docs.length === 0 ? (
          <div className="border-fog bg-canvas text-graphite rounded-lg border border-dashed py-8 text-center text-sm">
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
                    'bg-canvas overflow-hidden rounded-lg border shadow-sm' +
                    (isActiveFolder
                      ? 'border-primary-bright ring-primary-soft ring-1'
                      : 'border-fog')
                  }
                >
                  {group.folderKey !== null ? (
                    <button
                      type="button"
                      onClick={() => handleSelectFolder(group.label)}
                      className="border-fog bg-cloud hover:bg-primary-ghost flex w-full items-center justify-between border-b px-3 py-2 text-left"
                    >
                      <span className="text-ink truncate text-sm font-semibold">{group.label}</span>
                      <span className="text-graphite ml-2 shrink-0 text-xs">
                        {group.documents.length}개
                      </span>
                    </button>
                  ) : (
                    <div className="border-fog bg-cloud flex items-center justify-between border-b px-3 py-2">
                      <span className="text-charcoal text-sm font-semibold">{group.label}</span>
                      <span className="text-graphite text-xs">{group.documents.length}개</span>
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
                        isRetryPending={
                          retryMutation.isPending && retryMutation.variables === doc.documentId
                        }
                        onSelect={(documentId) => handleSelectFile(documentId, doc.folderId)}
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
          highlightBbox={highlightBbox}
          onManualPageChange={() => setHighlightBbox(null)}
        />
      ) : (
        <div className="bg-cloud text-graphite flex flex-1 items-center justify-center text-sm">
          폴더 채팅 모드 — PDF 뷰어는 문서 모드에서 사용합니다.
        </div>
      )}

      <div className="border-fog bg-canvas flex w-96 flex-col border-l">
        <div className="border-fog flex border-b">
          <button
            type="button"
            onClick={() => setChatMode('document')}
            className={
              'flex-1 px-3 py-2 text-sm' +
              (chatMode === 'document'
                ? 'border-primary text-primary-deep border-b-2 font-medium'
                : 'text-graphite')
            }
          >
            문서 채팅
          </button>
          <button
            type="button"
            onClick={() => setChatMode('folder')}
            className={
              'flex-1 px-3 py-2 text-sm' +
              (chatMode === 'folder'
                ? 'border-primary text-primary-deep border-b-2 font-medium'
                : 'text-graphite')
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
            onPageNavigate={(page, bbox) => {
              setTargetPage(page)
              setHighlightBbox(bbox ?? null)
            }}
          />
        ) : user?.tenantId ? (
          folderName.trim() ? (
            <FolderChatPanel folderId={folderName.trim()} tenantId={user.tenantId} />
          ) : (
            <div className="text-graphite flex flex-1 items-center justify-center p-6 text-center text-sm">
              왼쪽에서 폴더 이름을 입력하거나, 폴더 카드 제목을 클릭한 뒤 질문하세요.
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}
