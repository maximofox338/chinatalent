/**
 * Worker-profile reads/writes (the talent directory).
 *
 * RLS notes (HELPERS §4): worker_profiles are readable by any authenticated
 * user but writable only by their owner. `is_verified` is trust-and-safety
 * controlled, so it is deliberately NOT part of any user-supplied input here.
 * Remember worker_profiles.id ≠ profiles.id — own-row lookups go via profile_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkerProfileRow } from '../types/db';
import { toApiError } from '../utils/db';

export interface WorkerProfileInput {
  headline?: string;
  summary?: string;
  years_experience?: number;
  hourly_rate_usd?: number;
  availability?: 'full_time' | 'part_time' | 'freelance' | 'not_available';
  english_level?: string;
  chinese_level?: string;
  open_to_relocation?: boolean;
  portfolio_url?: string;
  resume_url?: string;
}

export interface ListOptions {
  limit: number;
  offset: number;
}

/** Browse the talent directory (any authenticated user). */
export async function listWorkers(
  client: SupabaseClient,
  { limit, offset }: ListOptions,
): Promise<WorkerProfileRow[]> {
  const { data, error } = await client
    .from('worker_profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw toApiError(error);
  return (data as WorkerProfileRow[] | null) ?? [];
}

/** A worker profile by its own id (worker_profiles.id), or null. */
export async function getWorkerById(
  client: SupabaseClient,
  id: string,
): Promise<WorkerProfileRow | null> {
  const { data, error } = await client
    .from('worker_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw toApiError(error);
  return (data as WorkerProfileRow | null) ?? null;
}

/** The caller's own worker profile (looked up by profile_id), or null. */
export async function getOwnWorker(
  client: SupabaseClient,
  userId: string,
): Promise<WorkerProfileRow | null> {
  const { data, error } = await client
    .from('worker_profiles')
    .select('*')
    .eq('profile_id', userId)
    .maybeSingle();

  if (error) throw toApiError(error);
  return (data as WorkerProfileRow | null) ?? null;
}

/**
 * Create or update the caller's worker profile. We branch on whether a row
 * already exists rather than relying on upsert, so the insert path can pin
 * profile_id to the caller and the update path is scoped by it.
 */
export async function upsertOwnWorker(
  client: SupabaseClient,
  userId: string,
  input: WorkerProfileInput,
): Promise<WorkerProfileRow> {
  const existing = await getOwnWorker(client, userId);

  if (existing) {
    const { data, error } = await client
      .from('worker_profiles')
      .update(input)
      .eq('profile_id', userId)
      .select('*')
      .single();
    if (error) throw toApiError(error);
    return data as WorkerProfileRow;
  }

  const { data, error } = await client
    .from('worker_profiles')
    .insert({ profile_id: userId, ...input })
    .select('*')
    .single();
  if (error) throw toApiError(error);
  return data as WorkerProfileRow;
}
