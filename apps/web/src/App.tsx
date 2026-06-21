import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useProfile } from './hooks/useProfile';
import ProtectedRoute, { FullScreenLoader } from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Index />} />

      {/* Public — but signed-in users are bounced to their dashboard. */}
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        }
      />

      {/* Requires auth; shown only when the user has no profile yet. */}
      <Route
        path="/register"
        element={
          <ProtectedRoute>
            <RegisterGate />
          </ProtectedRoute>
        }
      />

      {/* Requires auth AND a completed profile. */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <RequireProfile>
              <Layout>
                <Dashboard />
              </Layout>
            </RequireProfile>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

/** Root route: send users to their dashboard if authed, otherwise to login. */
function Index(): JSX.Element {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

/** Keeps authenticated users off public-only pages like /login. */
function RedirectIfAuthed({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** For /register: bounce to dashboard if a profile already exists. */
function RegisterGate(): JSX.Element {
  const { profile, loading, error } = useProfile();
  if (loading) return <FullScreenLoader />;
  if (profile && !error) return <Navigate to="/dashboard" replace />;
  return <Register />;
}

/** For /dashboard: send users without a profile to /register first. */
function RequireProfile({ children }: { children: ReactNode }): JSX.Element {
  const { profile, loading, needsRegistration, error, refresh } = useProfile();

  if (loading) return <FullScreenLoader />;
  if (needsRegistration) return <Navigate to="/register" replace />;

  if (error || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p className="text-sm text-red-600">{error ?? 'We couldn’t load your profile.'}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
