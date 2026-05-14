import { Navigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { userAtom, isAuthenticatedAtom } from '../stores/auth';

export function AdminPage() {
  const [isAuth] = useAtom(isAuthenticatedAtom);
  const [user] = useAtom(userAtom);

  if (!isAuth) return <Navigate to="/login" />;
  if (user?.role !== 'admin') return <Navigate to="/" />;

  return (
    <div className="flex flex-1 items-center justify-center text-gray-400">
      Admin panel coming soon
    </div>
  );
}
