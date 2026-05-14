import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { filesApi, type DocumentResponse } from '../api/files';

export function MainPage() {
  const { user, logout } = useAuth();
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFiles = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const list = await filesApi.list(user.tenantId);
      setDocs(list);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [user]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-lg font-bold">Document AI Chat</h1>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>{user?.email}</span>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
            {user?.role}
          </span>
          <button
            onClick={logout}
            className="rounded bg-red-50 px-3 py-1 text-sm text-red-600 hover:bg-red-100"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-72 border-r bg-gray-50 p-4">
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            id="file-upload"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !user) return;
              try {
                await filesApi.upload(user.tenantId, file);
                await loadFiles();
              } catch (err: any) {
                setError(err?.response?.data?.message || 'Upload failed');
              }
            }}
          />
          <label
            htmlFor="file-upload"
            className="mb-4 flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500"
          >
            + Upload PDF
          </label>

          {error && (
            <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">
              Loading...
            </div>
          ) : docs.length === 0 ? (
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
    </div>
  );
}
