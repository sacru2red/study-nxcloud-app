import type { DocumentListItem } from '../lib/group-documents-by-folder'
import { IndexProgressDisplay, type IndexProgressData } from './index-progress-display'

interface DocumentFileListItemProps {
  doc: DocumentListItem
  isSelected: boolean
  displayIndexStatus: string
  indexProgress?: IndexProgressData | null
  isRetryPending: boolean
  onSelect: (documentId: string) => void
  onDownload: (downloadUrl: string | null, fileName: string) => void
  onRetry: (documentId: string) => void
}

export function DocumentFileListItem({
  doc,
  isSelected,
  displayIndexStatus,
  indexProgress,
  isRetryPending,
  onSelect,
  onDownload,
  onRetry,
}: DocumentFileListItemProps) {
  const retryDisabled =
    isRetryPending || indexProgress?.diagnostic?.retryRecommended === false

  return (
    <li
      data-document-id={doc.documentId}
      onClick={() => onSelect(doc.documentId)}
      className={
        'cursor-pointer rounded-md border bg-canvas p-2.5 text-sm hover:shadow-sm' +
        (isSelected ? ' border-primary ring-1 ring-primary-soft' : ' border-fog')
      }
    >
      <p className="truncate font-medium text-ink">{doc.fileName}</p>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={
            'inline-block rounded px-1.5 py-0.5 text-xs font-medium' +
            (displayIndexStatus === 'COMPLETED'
              ? ' bg-storm-mist/40 text-storm-deep'
              : displayIndexStatus === 'PENDING'
                ? ' bg-accent-sale-soft text-accent-sale'
                : displayIndexStatus === 'PROCESSING'
                  ? ' bg-primary-soft text-primary-deep'
                  : ' bg-primary-soft text-error')
          }
        >
          {displayIndexStatus}
        </span>
        <span className="text-xs text-graphite">{(doc.fileSize / 1024).toFixed(1)} KB</span>
      </div>
      {indexProgress &&
        (displayIndexStatus === 'PENDING' ||
          displayIndexStatus === 'PROCESSING' ||
          displayIndexStatus === 'FAILED') && (
          <IndexProgressDisplay progress={indexProgress} compact />
        )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onDownload(doc.ncDownloadUrl, doc.fileName)
        }}
        disabled={!doc.ncDownloadUrl}
        className="mt-2 w-full rounded border border-fog px-2 py-1 text-xs text-charcoal hover:bg-cloud disabled:cursor-not-allowed disabled:opacity-50"
      >
        다운로드
      </button>
      {doc.indexStatus !== 'COMPLETED' && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onRetry(doc.documentId)
          }}
          disabled={retryDisabled}
          title={retryDisabled && indexProgress?.diagnostic ? indexProgress.diagnostic.hint : undefined}
          className="mt-1 w-full rounded border border-accent-sale/30 bg-accent-sale-soft px-2 py-1 text-xs text-accent-sale hover:bg-accent-sale-soft/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRetryPending
            ? '재시도 중...'
            : indexProgress?.diagnostic?.code === 'EMBEDDING_ACTIVE' ||
                indexProgress?.diagnostic?.code === 'EMBEDDING_RATE_LIMITED'
              ? '임베딩 진행 중'
              : '재시도'}
        </button>
      )}
    </li>
  )
}
