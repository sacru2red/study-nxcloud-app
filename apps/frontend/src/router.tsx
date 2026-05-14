import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
} from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { userAtom, logoutAtom } from './stores/auth';
import { LoginPage } from './pages/login-page';
import { MainPage } from './pages/main-page';
import { AdminPage } from './pages/admin-page';

function AppHeader() {
  const [user] = useAtom(userAtom);
  const [, doLogout] = useAtom(logoutAtom);
  if (!user) return null;
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <h1 className="text-lg font-bold">Document AI Chat</h1>
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span>{user.email}</span>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
          {user.role}
        </span>
        <button
          onClick={doLogout}
          className="rounded bg-red-50 px-3 py-1 text-sm text-red-600 hover:bg-red-100"
        >
          Logout
        </button>
      </div>
    </header>
  );
}

const rootRoute = createRootRoute({
  component: () => (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <Outlet />
    </div>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: MainPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminPage,
});

const routeTree = rootRoute.addChildren([loginRoute, indexRoute, adminRoute]);

export const router = createRouter({ routeTree });
