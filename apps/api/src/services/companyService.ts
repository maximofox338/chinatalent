/**
 * Company-profile reads/writes.
 *
 * RLS notes (HELPERS §4): company_profiles are world-readable; only the owner
 * may insert and only owner/admin members may update. Membership
 * (company_members) is the source of truth for "can act on behalf of".
 *
 * The bootstrap gotcha: company_members writes require the caller to ALREADY be
 * an owner/admin of that company (`company_members_write_admin`). When a brand
 * new company is created its owner has no seat yet, so the very first seat
 * cannot be inserted under RLS. We therefore create that one seat with the
 * service-role client — a legitimate trusted bootstrap, and safe because we set
 * the owner ourselves and grant the seat to that exact same user.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyProfileRow } from '../types/db';
import { serviceClient } from '../lib/supabase';
import { ApiError } from '../utils/http';
import { toApiError } from '../utils/db';
import type { ListOptions } from './workerService';

export interface CreateCompanyInput {
  name: string;
  slug?: string;
  website?: string;
  description?: string;
  industry?: string;
  size?: string;
  headquarters_country?: string;
  logo_url?: string;
}

export interface UpdateCompanyInput {
  name?: string;
  website?: string;
  description?: string;
  industry?: string;
  size?: string;
  headquarters_country?: string;
  logo_url?: string;
}

/** Derive a URL-safe slug from a company name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function listCompanies(
  client: SupabaseClient,
  { limit, offset }: ListOptions,
): Promise<CompanyProfileRow[]> {
  const { data, error } = await client
    .from('company_profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw toApiError(error);
  return (data as CompanyProfileRow[] | null) ?? [];
}

export async function getCompanyById(
  client: SupabaseClient,
  id: string,
): Promise<CompanyProfileRow | null> {
  const { data, error } = await client
    .from('company_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw toApiError(error);
  return (data as CompanyProfileRow | null) ?? null;
}

/**
 * Create a company owned by the caller, then bootstrap their owner seat.
 * If the seat insert fails the company is rolled back (deleted) so we never
 * leave an orphaned, member-less company that nobody can manage.
 */
export async function createCompany(
  client: SupabaseClient,
  userId: string,
  input: CreateCompanyInput,
): Promise<CompanyProfileRow> {
  const slug = input.slug ? slugify(input.slug) : slugify(input.name);
  if (!slug) {
    throw ApiError.invalidInput('Company name must contain alphanumeric characters');
  }

  // Insert the company AS the user — RLS enforces owner_profile_id = self.
  const { data, error } = await client
    .from('company_profiles')
    .insert({ ...input, slug, owner_profile_id: userId })
    .select('*')
    .single();

  if (error) throw toApiError(error, 'A company with that name/slug already exists');
  const company = data as CompanyProfileRow;

  // Bootstrap the owner seat with the service role (RLS can't grant the first
  // seat). Authorized by construction: we just set owner = userId above.
  const admin = serviceClient();
  const { error: seatError } = await admin.from('company_members').insert({
    company_id: company.id,
    profile_id: userId,
    role: 'owner',
  });

  if (seatError) {
    // Roll back the orphaned company; ignore any cleanup error and surface the
    // original failure.
    await admin.from('company_profiles').delete().eq('id', company.id);
    throw toApiError(seatError);
  }

  return company;
}

/** Update a company. RLS requires the caller to be an owner/admin member. */
export async function updateCompany(
  client: SupabaseClient,
  id: string,
  patch: UpdateCompanyInput,
): Promise<CompanyProfileRow> {
  const { data, error } = await client
    .from('company_profiles')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw toApiError(error);
  return data as CompanyProfileRow;
}
