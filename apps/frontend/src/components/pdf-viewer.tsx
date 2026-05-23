import api from 'backend-sdk'
import { useEffect, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { getConnection } from '../api/client'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export interface PdfViewerProps {
  fileId: string | null
  fileName: string | null
  targetPage?: number | null
}

const getAccessToken = () => {
  const rawToken = localStorage.getItem('accessToken')
  if (!rawToken) {
    return null
  }

  try {
    const parsedToken = JSON.parse(rawToken) as unknown
    return typeof parsedToken === 'string' ? parsedToken : rawToken
  } catch {
    return rawToken
  }
}

export function PdfViewer({ fileId, fileName, targetPage }: PdfViewerProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!targetPage || targetPage < 1) {
      return
    }

    setCurrentPage((previousPage) => {
      if (totalPages) {
        return Math.min(targetPage, totalPages)
      }
      return Math.max(1, targetPage)
    })
  }, [targetPage, totalPages])

  useEffect(() => {
    if (fileId) {
      setCurrentPage(1)
      setTotalPages(null)
      setLoadError(null)
    }
  }, [fileId])

  if (!fileId || !fileName) {
    return (
      <div className="flex flex-1 items-center justify-center text-graphite">
        <div className="text-center">
          <svg
            className="mx-auto mb-3 h-12 w-12 text-steel"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm">Select a file to view</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center text-graphite">
        <div className="text-center">
          <p className="text-sm text-error">Failed to load PDF</p>
          <p className="mt-1 text-xs text-graphite">{loadError}</p>
          <button
            onClick={() => setLoadError(null)}
            className="mt-2 text-xs text-primary-deep hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const handleLoadSuccess = ({ numPages }: { numPages: number }) => {
    setTotalPages(numPages)
    setCurrentPage((previousPage) => Math.min(previousPage, numPages))
    setLoadError(null)
  }

  const handleLoadError = (error: Error) => {
    setLoadError(error.message || 'Unknown PDF loading error')
  }

  const accessToken = getAccessToken()
  const fileSource = {
    url: getConnection().host + api.functional.files.content.path(fileId),
    httpHeaders: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-start justify-center overflow-auto bg-fog p-4">
        <Document
          file={fileSource}
          onLoadSuccess={handleLoadSuccess}
          onLoadError={handleLoadError}
          loading={<p className="text-sm text-graphite">Loading PDF...</p>}
          error={<p className="text-sm text-error">Failed to load PDF</p>}
        >
          <Page pageNumber={currentPage} renderTextLayer={false} renderAnnotationLayer={false} />
        </Document>
      </div>
      <div className="flex items-center justify-center gap-4 border-t border-fog bg-cloud px-4 py-2 text-xs text-graphite">
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className="rounded px-2 py-1 hover:bg-fog disabled:opacity-30"
        >
          Previous
        </button>
        <span>
          Page {currentPage}
          {totalPages ? ` / ${totalPages}` : ''}
        </span>
        <button
          onClick={() => setCurrentPage((p) => p + 1)}
          disabled={!totalPages || currentPage >= totalPages}
          className="rounded px-2 py-1 hover:bg-fog disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  )
}
