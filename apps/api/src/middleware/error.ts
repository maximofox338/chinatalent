/**
 * Central error handling + 404 fallback. Every route funnels failures here so
 * the wire format is uniform: { success: false, error, code }.
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError, sendError, type ApiCode } from '../utils/http';

/** Postgres error code raised when an INSERT/UPDATE violates an RLS policy. */
const RLS_VIOLATION = '42501';

interface PostgrestLike {
  code?: string;
  message?: string;
}

function asPostgrest(err: unknown): PostgrestLike | null {
  if (err && typeof err === 'object' && 'code' in err) {
    return err as PostgrestLike;
  }
  return null;
}

/** 404 for unmatched routes. */
export const notFound: RequestHandler = (_req, res) => {
  sendError(res, 404, 'Route not found', 'NOT_FOUND');
};

/**
 * Translate anything thrown during a request into our envelope. Known
 * ApiErrors pass through verbatim; an RLS policy violation becomes a 403; an
 * unknown error is logged and returned as an opaque 500 (never leak internals).
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    sendError(res, err.status, err.message, err.code);
    return;
  }

  const pg = asPostgrest(err);
  if (pg?.code === RLS_VIOLATION) {
    sendError(res, 403, 'You are not allowed to perform this action', 'UNAUTHORIZED');
    return;
  }

  // Unknown / unexpected: log server-side, return a generic message.
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  const code: ApiCode = 'SERVER_ERROR';
  sendError(res, 500, 'Internal server error', code);
};
