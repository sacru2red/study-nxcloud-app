import api from 'backend-sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PDFPageProxy } from 'pdfjs-dist'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { getConnection } from '../api/client'
import type { PdfBbox } from '../lib/pdf-bbox'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const PAGE_RENDER_WIDTH = 700

export interface PdfViewerProps {
  fileId: string | null
  fileName: string | null
  targetPage?: number | null
  highlightBbox?: PdfBbox | null
  onManualPageChange?: () => void
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

function bboxToOverlayStyle(
  bbox: PdfBbox,
  page: PDFPageProxy,
  renderWidth: number,
): { left: number; top: number; width: number; height: number } {
  const viewport = page.getViewport({ scale: renderWidth / page.view[2] })
  const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle([
    bbox.x,
    bbox.y,
    bbox.x + bbox.width,
    bbox.y + bbox.height,
  ])
  return {
    left: vx1,
    top: vy1,
    width: Math.max(vx2 - vx1, 2),
    height: Math.max(vy2 - vy1, 2),
  }
}

export function PdfViewer({
  fileId,
  fileName,
  targetPage,
  highlightBbox,
  onManualPageChange,
}: PdfViewerProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [renderedPage, setRenderedPage] = useState<PDFPageProxy | null>(null)
  const viewerRef = useRef<HTMLDivElement>(null)

  const clearPageReadyMarker = useCallback(() => {
    viewerRef.current?.removeAttribute('data-pdf-page-ready')
  }, [])

  const handlePageRenderSuccess = useCallback((page: PDFPageProxy) => {
    viewerRef.current?.setAttribute('data-pdf-page-ready', 'true')
    setRenderedPage(page)
  }, [])

  const handleLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setTotalPages(numPages)
    setCurrentPage((previousPage) => Math.min(previousPage, numPages))
    setLoadError(null)
  }, [])

  const handleLoadError = useCallback((error: Error) => {
    setLoadError(error.message || 'Unknown PDF loading error')
  }, [])

  const fileSource = useMemo(() => {
    const accessToken = getAccessToken()
    return {
      url: getConnection().host + api.functional.files.content.path(fileId ?? ''),
      httpHeaders: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    }
  }, [fileId])

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
      setRenderedPage(null)
      clearPageReadyMarker()
    }
  }, [fileId, clearPageReadyMarker])

  useEffect(() => {
    setRenderedPage(null)
    clearPageReadyMarker()
  }, [currentPage, clearPageReadyMarker])

  const highlightOverlay = useMemo(() => {
    if (!highlightBbox || !renderedPage) {
      return null
    }
    return bboxToOverlayStyle(highlightBbox, renderedPage, PAGE_RENDER_WIDTH)
  }, [highlightBbox, renderedPage])

  if (!fileId || !fileName) {
    return (
      <div className="text-graphite flex flex-1 items-center justify-center">
        <div className="text-center">
          <svg
            className="text-steel mx-auto mb-3 h-12 w-12"
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
      <div className="text-graphite flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-error text-sm">Failed to load PDF</p>
          <p className="text-graphite mt-1 text-xs">{loadError}</p>
          <button
            onClick={() => setLoadError(null)}
            className="text-primary-deep mt-2 text-xs hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const goToPage = (nextPage: number) => {
    onManualPageChange?.()
    setCurrentPage(nextPage)
  }

  return (
    <div ref={viewerRef} className="flex flex-1 flex-col" data-testid="pdf-viewer">
      <div className="bg-fog flex flex-1 items-start justify-center overflow-auto p-4">
        <Document
          file={fileSource}
          onLoadSuccess={handleLoadSuccess}
          onLoadError={handleLoadError}
          loading={
            <p className="text-graphite text-sm" data-testid="pdf-loading">
              Loading PDF...
            </p>
          }
          error={<p className="text-error text-sm">Failed to load PDF</p>}
        >
          <div className="relative inline-block">
            <Page
              pageNumber={currentPage}
              width={PAGE_RENDER_WIDTH}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onRenderSuccess={handlePageRenderSuccess}
            />
            {highlightOverlay && (
              <div
                className="border-primary-bright bg-primary-soft/40 pointer-events-none absolute border"
                style={{
                  left: highlightOverlay.left,
                  top: highlightOverlay.top,
                  width: highlightOverlay.width,
                  height: highlightOverlay.height,
                }}
                aria-hidden
              />
            )}
          </div>
        </Document>
      </div>
      <div className="border-fog bg-cloud text-graphite flex items-center justify-center gap-4 border-t px-4 py-2 text-xs">
        <button
          onClick={() => goToPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="hover:bg-fog rounded px-2 py-1 disabled:opacity-30"
        >
          Previous
        </button>
        <span>
          Page {currentPage}
          {totalPages ? ` / ${totalPages}` : ''}
        </span>
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={!totalPages || currentPage >= totalPages}
          className="hover:bg-fog rounded px-2 py-1 disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  )
}
