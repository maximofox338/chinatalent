import { createClient } from '@supabase/supabase-js';

// Supabase client for the browser. Uses the anon (public) key, which is safe
// to expose — row-level security on the backend enforces real authorization.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly during development rather than producing confusing auth errors
  // later. These come from apps/web/.env (see .env.example).
  throw new Error(
    'Missing Supabase env vars: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session in localStorage and refresh tokens automatically so
    // the user stays logged in across reloads.
    persistSession: true,
    autoRefreshToken: true,
    // Magic links return the session in the URL hash on redirect back to the app.
    detectSessionInUrl: true,
  },
});
