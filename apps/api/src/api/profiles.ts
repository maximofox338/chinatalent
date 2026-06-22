/**
 * Profile routes (self-service). Public display of other people's profiles is
 * deliberately NOT here: the profiles table is self-only under RLS (HELPERS §4),
 * and a public directory should go through a dedicated safe view / the worker
 * directory instead.
 *
 *   GET   /api/profiles/me   the caller's profile
 *   PATCH /api/profiles/me   update the caller's profile
 */
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, getClient, requireAuth } from '../middleware/auth';
import { asyncHandler, ApiError, sendOk } from '../utils/http';
import { parse } from '../utils/validate';
import { getOwnProfile, updateProfile, type UpdateProfileInput } from '../services/profileService';

const router = Router();

const updateSchema = z
  .object({
    display_name: z.string().min(1).max(120).optional(),
    full_name: z.string().min(1).max(200).optional(),
    avatar_url: z.string().url().max(500).optional(),
    country: z.string().length(2).optional(),
    timezone: z.string().min(1).max(64).optional(),
    locale: z.string().min(2).max(10).optional(),
    preferred_language: z.string().min(2).max(10).optional(),
    phone: z.string().min(3).max(32).optional(),
    bio: z.string().max(2000).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided',
  });

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    const profile = await getOwnProfile(getClient(req), userId);
    if (!profile) {
      throw ApiError.notFound('Profile not found', 'USER_NOT_FOUND');
    }
    sendOk(res, profile);
  }),
);

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    const patch = parse(updateSchema, req.body) as UpdateProfileInput;
    const profile = await updateProfile(getClient(req), userId, patch);
    sendOk(res, profile);
  }),
);

export default router;
