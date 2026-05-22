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
  return (
    <li
      data-document-id={doc.documentId}
      onClick={() => onSelect(doc.documentId)}
      className={
        'cursor-pointer rounded-md border bg-white p-2.5 text-sm hover:shadow-sm' +
        (isSelected ? ' border-blue-400 ring-1 ring-blue-200' : ' border-gray-100')
      }
    >
      <p className="truncate font-medium text-gray-800">{doc.fileName}</p>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={
            'inline-block rounded px-1.5 py-0.5 text-xs font-medium' +
            (displayIndexStatus === 'COMPLETED'
              ? ' bg-green-100 text-green-700'
              : displayIndexStatus === 'PENDING'
                ? ' bg-yellow-100 text-yellow-700'
                : displayIndexStatus === 'PROCESSING'
                  ? ' bg-blue-100 text-blue-700'
                  : ' bg-red-100 text-red-700')
          }
        >
          {displayIndexStatus}
        </span>
        <span className="text-xs text-gray-400">{(doc.fileSize / 1024).toFixed(1)} KB</span>
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
        className="mt-2 w-full rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
          disabled={isRetryPending}
          className="mt-1 w-full rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRetryPending ? '재시도 중...' : '재시도'}
        </button>
      )}
    </li>
  )
}
