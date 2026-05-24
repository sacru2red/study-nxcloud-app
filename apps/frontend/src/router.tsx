import { createRouter, createRootRoute, createRoute, Outlet, Link } from '@tanstack/react-router'
import { useAtom } from 'jotai'
import { userAtom, logoutAtom } from './stores/auth'
import { useQuota } from './queries'
import { StorageIndicator } from './components/storage-indicator'
import { LoginPage } from './pages/login-page'
import { MainPage } from './pages/main-page'
import { AdminPage } from './pages/admin-page'

function AppHeader() {
  const [user] = useAtom(userAtom)
  const [, doLogout] = useAtom(logoutAtom)
  const { data: quota } = useQuota(!!user)

  if (!user) return null
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <h1 className="text-lg font-bold">Document AI Chat</h1>
      <div className="text-charcoal flex items-center gap-4 text-sm">
        {quota && <StorageIndicator usedBytes={quota.usedBytes} quotaBytes={quota.quotaBytes} />}
        {user.role === 'admin' && (
          <Link
            to="/admin"
            data-testid="admin-nav-link"
            className="text-primary-deep hover:text-primary text-xs font-medium"
          >
            Admin
          </Link>
        )}
        <span>{user.email}</span>
        <span className="bg-fog rounded px-2 py-0.5 text-xs">{user.role}</span>
        <button
          onClick={doLogout}
          className="bg-primary-soft text-error hover:bg-primary-ghost rounded px-3 py-1 text-xs"
        >
          logout
        </button>
      </div>
    </header>
  )
}

const rootRoute = createRootRoute({
  component: () => (
    <div className="flex max-h-screen min-h-screen flex-col overflow-auto">
      <AppHeader />
      <Outlet />
    </div>
  ),
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: MainPage,
})

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminPage,
})

const routeTree = rootRoute.addChildren([loginRoute, indexRoute, adminRoute])

export const router = createRouter({ routeTree })
