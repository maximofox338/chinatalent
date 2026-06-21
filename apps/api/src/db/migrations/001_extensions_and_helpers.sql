-- 001_extensions_and_helpers.sql
-- Foundation: extensions, roles, RLS identity helpers, and shared triggers.
-- Idempotent: safe to run repeatedly.
--
-- WHY this file runs first: every later migration relies on gen_random_uuid()
-- (pgcrypto), the set_updated_at() trigger, and the app_current_user_id()
-- identity helper used by all RLS policies in 015.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- pgcrypto -> gen_random_uuid() for primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pg_trgm -> trigram GIN indexes for fuzzy search on titles / names.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
-- Supabase already provisions anon / authenticated / service_role. We create
-- them defensively so these migrations also run on a vanilla Postgres (e.g. a
-- local CI database for the RLS test suite). They are NOLOGIN groups.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Identity helper used by ALL RLS policies
-- ---------------------------------------------------------------------------
-- Returns the current request's user id (a profiles.id / auth.users.id).
--
-- It reads, in order of preference:
--   1. The Supabase JWT claim `sub` (set automatically by Supabase on every
--      authenticated PostgREST/Realtime request).
--   2. A plain `app.current_user_id` GUC, which the RLS test suite sets via
--      `SET LOCAL app.current_user_id = '<uuid>'` so tests can impersonate a
--      user without minting a real JWT.
--
-- `STABLE` (not VOLATILE) so the planner can cache it within a statement.
-- The `true` second arg to current_setting suppresses errors when unset.
CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    NULLIF(current_setting('app.current_user_id', true), '')
  )::uuid;
$$;

-- True when there is an authenticated principal on the request.
CREATE OR REPLACE FUNCTION app_is_authenticated()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app_current_user_id() IS NOT NULL;
$$;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh on every UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
