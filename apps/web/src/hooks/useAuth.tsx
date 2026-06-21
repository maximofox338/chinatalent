import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface AuthContextValue {
  /** The authenticated Supabase user, or null when signed out. */
  user: User | null;
  /** The full Supabase session (holds the access token), or null. */
  session: Session | null;
  /** True until the initial session has been resolved. */
  loading: boolean;
  /** Send a passwordless magic link to the given email. */
  signIn: (email: string) => Promise<void>;
  /** Sign the current user out. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Provides auth state to the whole app. Subscribes to Supabase auth changes
 * exactly once, so every consumer shares the same user/session/loading state.
 * Wrap the app (above the router) in this provider.
 */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Resolve the existing session on mount (e.g. after a page reload).
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    // Keep in sync with future sign-in / sign-out / token-refresh events.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const signIn = async (email: string): Promise<void> => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // After clicking the link the user lands back on the app and the
          // session is picked up from the URL hash (detectSessionInUrl).
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        throw new Error(error.message);
      }
    };

    const signOut = async (): Promise<void> => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw new Error(error.message);
      }
    };

    return {
      user: session?.user ?? null,
      session,
      loading,
      signIn,
      signOut,
    };
  }, [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Access the current auth state and actions. Must be used within <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
