/**
 * Worker directory routes.
 *
 *   GET /api/workers       browse the talent directory (any authed user)
 *   GET /api/workers/me    the caller's own worker profile
 *   PUT /api/workers/me    create or update the caller's worker profile
 *   GET /api/workers/:id   a single worker profile by worker_profiles.id
 */
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, getClient, requireAuth } from '../middleware/auth';
import { asyncHandler, ApiError, sendOk } from '../utils/http';
import { parse } from '../utils/validate';
import { parsePaging } from '../utils/paging';
import {
  getOwnWorker,
  getWorkerById,
  listWorkers,
  upsertOwnWorker,
  type WorkerProfileInput,
} from '../services/workerService';

const router = Router();

const uuidSchema = z.string().uuid();

const workerSchema = z
  .object({
    headline: z.string().max(200).optional(),
    summary: z.string().max(4000).optional(),
    years_experience: z.number().int().min(0).max(80).optional(),
    hourly_rate_usd: z.number().min(0).max(100000).optional(),
    availability: z.enum(['full_time', 'part_time', 'freelance', 'not_available']).optional(),
    english_level: z
      .enum(['basic', 'conversational', 'professional', 'fluent', 'native'])
      .optional(),
    chinese_level: z
      .enum(['basic', 'conversational', 'professional', 'fluent', 'native'])
      .optional(),
    open_to_relocation: z.boolean().optional(),
    portfolio_url: z.string().url().max(500).optional(),
    resume_url: z.string().url().max(500).optional(),
  })
  .strict();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const workers = await listWorkers(getClient(req), paging);
    sendOk(res, workers);
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    const worker = await getOwnWorker(getClient(req), userId);
    if (!worker) {
      throw ApiError.notFound('No worker profile yet');
    }
    sendOk(res, worker);
  }),
);

router.put(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    const input = parse(workerSchema, req.body) as WorkerProfileInput;
    const worker = await upsertOwnWorker(getClient(req), userId, input);
    sendOk(res, worker);
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const worker = await getWorkerById(getClient(req), id);
    if (!worker) {
      throw ApiError.notFound('Worker profile not found');
    }
    sendOk(res, worker);
  }),
);

export default router;
