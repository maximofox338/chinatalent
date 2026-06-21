import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Spinner } from './Spinner';

/** Full-screen loading state while auth/profile is being resolved. */
export function FullScreenLoader(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-brand-600">
      <Spinner className="h-8 w-8" label="Loading" />
    </div>
  );
}

/**
 * Gates a route behind authentication. While the session is resolving it shows
 * a spinner; if there's no authenticated user it redirects to /login.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
