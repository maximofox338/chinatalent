/**
 * Profile reads/writes. Every call goes through the caller's user-scoped client,
 * so RLS guarantees a profile can only be read or mutated by its owner (or an
 * admin) — the service does not re-check ownership because the database does.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileRow, UserRole } from '../types/db';
import { toApiError } from '../utils/db';

/** Fields a user may set when first creating their profile (register). */
export interface CreateProfileInput {
  role?: UserRole;
  display_name?: string;
  full_name?: string;
  country?: string;
  timezone?: string;
  locale?: string;
  preferred_language?: string;
  phone?: string;
  bio?: string;
}

/** Fields a user may change on their own profile. Excludes id/role/is_active. */
export interface UpdateProfileInput {
  display_name?: string;
  full_name?: string;
  avatar_url?: string;
  country?: string;
  timezone?: string;
  locale?: string;
  preferred_language?: string;
  phone?: string;
  bio?: string;
}

/**
 * The caller's own profile, or null if it doesn't exist yet. Under RLS a
 * non-self row simply isn't visible, so "null" here means "this user has no
 * profile" — exactly what we want for the register/login decision.
 */
export async function getOwnProfile(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();

  if (error) throw toApiError(error);
  return (data as ProfileRow | null) ?? null;
}

/** Create the caller's profile row (id is pinned to their auth id). */
export async function createProfile(
  client: SupabaseClient,
  userId: string,
  input: CreateProfileInput,
): Promise<ProfileRow> {
  const { data, error } = await client
    .from('profiles')
    .insert({ id: userId, ...input })
    .select('*')
    .single();

  if (error) throw toApiError(error, 'Profile already exists');
  return data as ProfileRow;
}

/** Update the caller's own profile and return the new row. */
export async function updateProfile(
  client: SupabaseClient,
  userId: string,
  patch: UpdateProfileInput,
): Promise<ProfileRow> {
  const { data, error } = await client
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .single();

  if (error) throw toApiError(error);
  return data as ProfileRow;
}
