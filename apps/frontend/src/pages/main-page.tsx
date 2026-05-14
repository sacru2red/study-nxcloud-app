import { Navigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { userAtom, isAuthenticatedAtom, logoutAtom } from '../stores/auth';
import { useFiles, useUploadFile } from '../queries';
import { useRef } from 'react';

export function MainPage() {
  const [isAuth] = useAtom(isAuthenticatedAtom);
  const [user] = useAtom(userAtom);
  const [, doLogout] = useAtom(logoutAtom);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: docs, isLoading } = useFiles(user?.tenantId);
  const uploadMutation = useUploadFile(user?.tenantId);

  if (!isAuth) return <Navigate to="/login" />;

  return (
    <div className="flex flex-1">
      <aside className="w-72 border-r bg-gray-50 p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadMutation.mutate(file);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mb-4 flex w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500"
        >
          + Upload PDF
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
                className="cursor-pointer rounded-lg border bg-white p-3 text-sm hover:shadow-sm"
              >
                <p className="truncate font-medium">{doc.fileName}</p>
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
                    {doc.indexStatus}
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

      <main className="flex flex-1 items-center justify-center text-gray-400">
        Select a file to view
      </main>
    </div>
  );
}
