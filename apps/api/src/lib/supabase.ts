/**
 * Supabase client factories — the single chokepoint through which the API
 * talks to Postgres. Which client you pick decides whether RLS protects the
 * user (see apps/api/src/db/HELPERS.md):
 *
 *   userClient(token)  → anon key + the caller's JWT. Runs as `authenticated`;
 *                        `app_current_user_id()` resolves from the JWT and RLS
 *                        scopes every row. USE THIS FOR ANYTHING USER-DRIVEN.
 *
 *   serviceClient()    → service role key. BYPASSES RLS ENTIRELY. Only for
 *                        trusted bootstraps/back-office work, and only after the
 *                        code has re-checked authorization itself.
 *
 *   authClient()       → anon key, no user. Used to validate a bearer token via
 *                        auth.getUser(token) in the auth middleware.
 *
 * Clients are configured to never persist or refresh sessions: this is a
 * stateless server, each request carries its own token.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

const STATELESS = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

let cachedAuthClient: SupabaseClient | null = null;
let cachedServiceClient: SupabaseClient | null = null;

/** Anon client used purely to verify JWTs (auth.getUser). Memoised. */
export function authClient(): SupabaseClient {
  if (!cachedAuthClient) {
    cachedAuthClient = createClient(env.supabaseUrl, env.supabaseAnonKey, STATELESS);
  }
  return cachedAuthClient;
}

/**
 * Per-request client acting AS the calling user. RLS is enforced. A fresh
 * client is created per call because the forwarded Authorization header differs
 * per user — never cache this one.
 */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    ...STATELESS,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Privileged client that BYPASSES RLS. Reserve for trusted server jobs and
 * bootstraps that policies cannot express. Memoised.
 */
export function serviceClient(): SupabaseClient {
  if (!cachedServiceClient) {
    cachedServiceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, STATELESS);
  }
  return cachedServiceClient;
}
