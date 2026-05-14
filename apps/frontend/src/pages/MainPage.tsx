import { useAuth } from '../hooks/useAuth';

export function MainPage() {
  const { user, logout } = useAuth();

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
      <main className="flex flex-1 items-center justify-center text-gray-400">
        3-column layout coming soon
      </main>
    </div>
  );
}
