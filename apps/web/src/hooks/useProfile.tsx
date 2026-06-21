import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@chinatalent/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from './useAuth';

export interface ProfileContextValue {
  /** The app-level user profile, or null if not yet created / signed out. */
  profile: User | null;
  /** True while the profile is being fetched. */
  loading: boolean;
  /** Non-null when the fetch failed for a reason other than "no profile". */
  error: string | null;
  /** True when the user is authenticated but has no profile yet (must register). */
  needsRegistration: boolean;
  /** Re-fetch the profile (e.g. right after registering). */
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

/**
 * Loads the backend profile (GET /api/auth/me) for the authenticated user.
 * A `USER_NOT_FOUND` response is treated as "needs registration" rather than
 * an error, which drives the post-login redirect to /register.
 *
 * Depends on <AuthProvider>; place it inside that provider.
 */
export function ProfileProvider({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const me = await api.get<User>('/api/auth/me');
      setProfile(me);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'USER_NOT_FOUND') {
        // Authenticated but no profile row yet — they need to register.
        setProfile(null);
      } else {
        setProfile(null);
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) {
      // Wait for auth to settle before deciding what to fetch.
      return;
    }
    if (!user) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, user, load]);

  const value: ProfileContextValue = {
    profile,
    loading: authLoading || loading,
    error,
    needsRegistration:
      !authLoading && !loading && Boolean(user) && profile === null && error === null,
    refresh: load,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (ctx === undefined) {
    throw new Error('useProfile must be used within a <ProfileProvider>');
  }
  return ctx;
}
