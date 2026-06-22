/**
 * Auth routes — intentionally THIN (ADR-001). Supabase owns magic links and
 * issues the JWT; these endpoints only verify that JWT (via requireAuth) and
 * manage the profiles row that hangs off the auth user.
 *
 *   POST /api/auth/register  create the caller's profile after first sign-in
 *   GET  /api/auth/me        the caller's profile (+ email)
 *   POST /api/auth/logout    best-effort token revocation
 */
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, getClient, requireAuth } from '../middleware/auth';
import { asyncHandler, ApiError, sendOk } from '../utils/http';
import { parse } from '../utils/validate';
import { createProfile, getOwnProfile, type CreateProfileInput } from '../services/profileService';
import type { ProfileRow } from '../types/db';

const router = Router();

const registerSchema = z
  .object({
    role: z.enum(['worker', 'employer']).optional(),
    display_name: z.string().min(1).max(120).optional(),
    full_name: z.string().min(1).max(200).optional(),
    country: z.string().length(2).optional(),
    timezone: z.string().min(1).max(64).optional(),
    locale: z.string().min(2).max(10).optional(),
    preferred_language: z.string().min(2).max(10).optional(),
    phone: z.string().min(3).max(32).optional(),
    bio: z.string().max(2000).optional(),
  })
  .strict();

/** Shape returned to the client for "who am I" — profile plus auth email. */
function mePayload(profile: ProfileRow, email: string): ProfileRow & { email: string } {
  return { ...profile, email };
}

// POST /api/auth/register — create the profile row for a freshly signed-in user.
router.post(
  '/register',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId, email } = getAuth(req);
    const client = getClient(req);
    const input = parse(registerSchema, req.body) as CreateProfileInput;

    const existing = await getOwnProfile(client, userId);
    if (existing) {
      throw ApiError.conflict('Profile already registered');
    }

    const profile = await createProfile(client, userId, input);
    sendOk(res, mePayload(profile, email), 201);
  }),
);

// GET /api/auth/me — the caller's profile. 404 if they haven't registered yet.
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId, email } = getAuth(req);
    const client = getClient(req);

    const profile = await getOwnProfile(client, userId);
    if (!profile) {
      throw ApiError.notFound('Profile not found — complete registration', 'USER_NOT_FOUND');
    }
    sendOk(res, mePayload(profile, email));
  }),
);

// POST /api/auth/logout — JWTs are stateless; this is a best-effort revoke of
// the refresh session. We always report success so the client can clear state.
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const client = getClient(req);
    try {
      await client.auth.signOut();
    } catch {
      // Revocation is best-effort; the client discarding the token is what
      // actually ends the session.
    }
    sendOk(res, { signed_out: true });
  }),
);

export default router;
