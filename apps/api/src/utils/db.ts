/**
 * Map a Supabase/PostgREST error to our ApiError taxonomy. Centralised so every
 * service translates DB failures the same way — most importantly, an RLS policy
 * violation (a blocked write) becomes a clean 403 rather than a leaked 500.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { ApiError } from './http';

const RLS_VIOLATION = '42501';
const UNIQUE_VIOLATION = '23505';
// PostgREST: .single()/.maybeSingle() got zero rows where exactly one was
// required. With RLS this is ambiguous — the row may not exist OR the policy's
// USING clause filtered it out (e.g. updating a company you don't manage). We
// return 404 rather than leak which it is.
const NO_ROWS = 'PGRST116';

export function toApiError(
  error: PostgrestError,
  conflictMessage = 'Resource already exists',
): ApiError {
  switch (error.code) {
    case RLS_VIOLATION:
      return ApiError.unauthorized();
    case UNIQUE_VIOLATION:
      return ApiError.conflict(conflictMessage);
    case NO_ROWS:
      return ApiError.notFound('Not found or not permitted');
    default:
      // Surface nothing internal to the client; the handler logs the original.
      return new ApiError(500, 'Database error', 'SERVER_ERROR');
  }
}
