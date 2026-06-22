/**
 * Parse `?limit=&offset=` query params into safe bounds. Invalid or absent
 * values fall back to defaults; limit is capped so a caller can't ask for an
 * unbounded page.
 */
import { z } from 'zod';
import { parse } from './validate';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const pagingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export interface Paging {
  limit: number;
  offset: number;
}

export function parsePaging(query: unknown): Paging {
  return parse(pagingSchema, query);
}
