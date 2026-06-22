/**
 * Authentication middleware.
 *
 * Supabase owns the magic-link flow and mints the JWT (ADR-001 — no passwords).
 * Our job is THIN: pull the bearer token, verify it with Supabase, and hang the
 * verified identity + a user-scoped (RLS-enforced) client off the request.
 *
 * Verification goes through `auth.getUser(token)`, which asks the Supabase auth
 * server to validate the signature and expiry — we never trust an unverified
 * token, and we never decode claims ourselves.
 */
import type { Request, RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authClient, userClient } from '../lib/supabase';
import { ApiError } from '../utils/http';
import type { AuthContext } from '../types/express';

function bearerToken(req: Request): string | null {
  const header = req.header('authorization') ?? req.header('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/**
 * Require a valid Supabase JWT. On success, sets `req.auth` and `req.supabase`;
 * on failure, forwards a 401 INVALID_TOKEN to the error handler.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    const token = bearerToken(req);
    if (!token) {
      throw ApiError.invalidToken('Missing bearer token');
    }

    const { data, error } = await authClient().auth.getUser(token);
    if (error || !data.user) {
      throw ApiError.invalidToken();
    }

    req.auth = {
      userId: data.user.id,
      email: data.user.email ?? '',
      accessToken: token,
    };
    req.supabase = userClient(token);
  })().then(next, next);
};

/**
 * Read the verified auth context, asserting it is present. Use inside handlers
 * mounted behind `requireAuth`; throwing here signals a wiring bug, not a
 * client error.
 */
export function getAuth(req: Request): AuthContext {
  if (!req.auth || !req.supabase) {
    throw new ApiError(500, 'Auth context missing — route not behind requireAuth', 'SERVER_ERROR');
  }
  return req.auth;
}

/** The caller's RLS-enforced Supabase client. Use behind `requireAuth`. */
export function getClient(req: Request): SupabaseClient {
  if (!req.supabase) {
    throw new ApiError(500, 'Auth context missing — route not behind requireAuth', 'SERVER_ERROR');
  }
  return req.supabase;
}
