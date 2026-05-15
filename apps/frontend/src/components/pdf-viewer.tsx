import { useState, useEffect } from 'react';

export interface PdfViewerProps {
  ncDownloadUrl: string | null;
  fileName: string | null;
  targetPage?: number | null;
}

export function PdfViewer({
  ncDownloadUrl,
  fileName,
  targetPage,
}: PdfViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (targetPage && targetPage >= 1) {
      setCurrentPage(targetPage);
    }
  }, [targetPage]);

  if (!ncDownloadUrl || !fileName) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400">
        <div className="text-center">
          <svg
            className="mx-auto mb-3 h-12 w-12 text-gray-300"
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
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-sm text-red-500">Failed to load PDF</p>
          <button
            onClick={() => setLoadError(false)}
            className="mt-2 text-xs text-blue-500 hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const pdfUrl = `${ncDownloadUrl}#page=${currentPage}`;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 bg-white">
        <iframe
          src={pdfUrl}
          className="h-full w-full"
          title={fileName}
          onError={() => setLoadError(true)}
        />
      </div>
      <div className="flex items-center justify-center gap-4 border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className="rounded px-2 py-1 hover:bg-gray-200 disabled:opacity-30"
        >
          Previous
        </button>
        <span>Page {currentPage}</span>
        <button
          onClick={() => setCurrentPage((p) => p + 1)}
          className="rounded px-2 py-1 hover:bg-gray-200"
        >
          Next
        </button>
      </div>
    </div>
  );
}
