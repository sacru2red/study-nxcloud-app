import type { PdfBbox } from '../lib/pdf-bbox'

export interface ChatSource {
  fileName: string
  pageNo: number
  paragraphNo: number
  text: string
  similarity: number
  bbox?: PdfBbox
}

export interface SourceCardProps {
  source: ChatSource
  onSourceClick?: (pageNo: number, bbox?: PdfBbox) => void
}

export function SourceCard({ source, onSourceClick }: SourceCardProps) {
  const truncatedText = source.text.length > 150 ? source.text.slice(0, 150) + '...' : source.text
  const isClickable = Boolean(onSourceClick)

  return (
    <div
      className={
        'border-fog bg-cloud rounded-lg border p-3 text-xs' +
        (isClickable ? 'hover:border-primary-bright cursor-pointer' : '')
      }
      onClick={() => onSourceClick?.(source.pageNo, source.bbox)}
      onKeyDown={(event) => {
        if (!isClickable) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSourceClick?.(source.pageNo, source.bbox)
        }
      }}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="mb-1 flex items-center gap-2">
        <svg
          className="text-graphite h-3.5 w-3.5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
        <span className="text-charcoal font-medium">{source.fileName}</span>
        <span className="bg-primary-soft text-primary-deep ml-auto rounded px-1.5 py-0.5 text-[10px]">
          {Math.round(source.similarity * 100)}% match
        </span>
      </div>
      <p className="text-graphite">
        Page {source.pageNo}, Paragraph {source.paragraphNo}
      </p>
      <p className="text-charcoal mt-1 leading-relaxed">{truncatedText}</p>
    </div>
  )
}
