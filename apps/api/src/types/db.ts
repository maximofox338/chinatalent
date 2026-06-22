/**
 * Hand-written row types for the tables the API touches, mirroring SCHEMA.sql.
 * snake_case throughout — these are the exact shapes Postgres returns and the
 * exact shapes the frontend consumes (bodies are snake_case by contract).
 */

export type UserRole = 'worker' | 'employer' | 'admin';

export interface ProfileRow {
  id: string;
  role: UserRole;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
  timezone: string | null;
  locale: string;
  preferred_language: string;
  phone: string | null;
  bio: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkerProfileRow {
  id: string;
  profile_id: string;
  headline: string | null;
  summary: string | null;
  years_experience: number | null;
  hourly_rate_usd: number | null;
  availability: 'full_time' | 'part_time' | 'freelance' | 'not_available';
  english_level: string | null;
  chinese_level: string | null;
  open_to_relocation: boolean;
  portfolio_url: string | null;
  resume_url: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyProfileRow {
  id: string;
  owner_profile_id: string;
  name: string;
  slug: string;
  website: string | null;
  description: string | null;
  industry: string | null;
  size: string | null;
  headquarters_country: string | null;
  logo_url: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}
