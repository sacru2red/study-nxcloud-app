export interface ChatSource {
  fileName: string
  pageNo: number
  paragraphNo: number
  text: string
  similarity: number
}

export interface SourceCardProps {
  source: ChatSource
  onPageClick?: (pageNo: number) => void
}

export function SourceCard({ source, onPageClick }: SourceCardProps) {
  const truncatedText = source.text.length > 150 ? source.text.slice(0, 150) + '...' : source.text

  return (
    <div
      className={
        'rounded-lg border border-fog bg-cloud p-3 text-xs' +
        (onPageClick ? 'cursor-pointer hover:border-primary-bright' : '')
      }
      onClick={() => onPageClick?.(source.pageNo)}
    >
      <div className="mb-1 flex items-center gap-2">
        <svg
          className="h-3.5 w-3.5 flex-shrink-0 text-graphite"
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
        <span className="font-medium text-charcoal">{source.fileName}</span>
        <span className="ml-auto rounded bg-primary-soft px-1.5 py-0.5 text-[10px] text-primary-deep">
          {Math.round(source.similarity * 100)}% match
        </span>
      </div>
      <p className="text-graphite">
        Page {source.pageNo}, Paragraph {source.paragraphNo}
      </p>
      <p className="mt-1 leading-relaxed text-charcoal">{truncatedText}</p>
    </div>
  )
}
