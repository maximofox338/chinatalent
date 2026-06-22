/**
 * Request augmentation. `requireAuth` populates these on every authenticated
 * request; routes/services read them instead of re-parsing headers or
 * re-creating clients.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** The verified identity behind a request, derived from the Supabase JWT. */
export interface AuthContext {
  /** profiles.id === auth.users.id (the JWT `sub`). */
  userId: string;
  email: string;
  /** Raw bearer token, forwarded to user-scoped Supabase calls. */
  accessToken: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Present only after `requireAuth`. */
      auth?: AuthContext;
      /**
       * Supabase client acting AS the caller (RLS enforced). Present only
       * after `requireAuth`.
       */
      supabase?: SupabaseClient;
    }
  }
}

export {};
