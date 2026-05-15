import { useState, useRef } from 'react';
import { Navigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { userAtom, isAuthenticatedAtom } from '../stores/auth';
import { selectedFileIdAtom } from '../stores/files';
import { useFiles, useUploadFile, useIndexStatus } from '../queries';
import { PdfViewer } from '../components/pdf-viewer';
import { ChatPanel } from '../components/chat-panel';

export function MainPage() {
  const [isAuth] = useAtom(isAuthenticatedAtom);
  const [user] = useAtom(userAtom);
  const [selectedFileId, setSelectedFileId] = useAtom(selectedFileIdAtom);
  const [targetPage, setTargetPage] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: docs, isLoading } = useFiles(user?.tenantId);
  const uploadMutation = useUploadFile(user?.tenantId);

  const selectedDoc = docs?.find((d) => d.documentId === selectedFileId);

  const handleSelectFile = (docId: string) => {
    setSelectedFileId(docId);
    setTargetPage(null);
  };

  const { data: indexStatusData } = useIndexStatus(
    selectedFileId,
    selectedDoc?.indexStatus === 'PENDING' ||
      selectedDoc?.indexStatus === 'PROCESSING',
  );

  const currentIndexStatus =
    indexStatusData?.status ?? selectedDoc?.indexStatus ?? null;

  if (!isAuth) return <Navigate to="/login" />;

  return (
    <div className="flex flex-1">
      <aside className="w-72 flex-shrink-0 overflow-y-auto border-r bg-gray-50 p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              uploadMutation.mutate(file);
            }
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="mb-4 flex w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploadMutation.isPending ? (
            <span className="flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Uploading...
            </span>
          ) : (
            '+ Upload PDF'
          )}
        </button>

        {uploadMutation.isError && (
          <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-600">
            Upload failed
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">
            Loading...
          </div>
        ) : !docs || docs.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            No files yet
          </div>
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.documentId}
                onClick={() => handleSelectFile(doc.documentId)}
                className={
                  'cursor-pointer rounded-lg border bg-white p-3 text-sm hover:shadow-sm ' +
                  (selectedFileId === doc.documentId
                    ? 'border-blue-400 ring-1 ring-blue-200'
                    : '')
                }
              >
                <p className="truncate font-medium text-gray-800">
                  {doc.fileName}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={
                      'inline-block rounded px-1.5 py-0.5 text-xs font-medium ' +
                      (doc.indexStatus === 'COMPLETED'
                        ? 'bg-green-100 text-green-700'
                        : doc.indexStatus === 'PENDING'
                          ? 'bg-yellow-100 text-yellow-700'
                          : doc.indexStatus === 'PROCESSING'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-red-100 text-red-700')
                    }
                  >
                    {selectedFileId === doc.documentId &&
                    indexStatusData?.status
                      ? indexStatusData.status
                      : doc.indexStatus}
                  </span>
                  <span className="text-xs text-gray-400">
                    {(doc.fileSize / 1024).toFixed(1)} KB
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <PdfViewer
        ncDownloadUrl={selectedDoc?.ncDownloadUrl ?? null}
        fileName={selectedDoc?.fileName ?? null}
        targetPage={targetPage}
      />

      <ChatPanel
        fileId={selectedFileId}
        fileName={selectedDoc?.fileName ?? null}
        indexStatus={currentIndexStatus}
        onPageNavigate={(page) => setTargetPage(page)}
      />
    </div>
  );
}
