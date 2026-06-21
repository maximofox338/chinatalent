-- 002_profiles.sql
-- The central identity table. One row per platform user, keyed by the same
-- UUID Supabase Auth assigns in auth.users. Everything else hangs off profiles.

CREATE TABLE IF NOT EXISTS profiles (
  id                  uuid PRIMARY KEY,
  -- Account archetype. A single account is exactly one of these.
  role                text NOT NULL DEFAULT 'worker'
                        CHECK (role IN ('worker', 'employer', 'admin')),
  display_name        text,
  full_name           text,
  avatar_url          text,
  country             text,                         -- ISO 3166-1 alpha-2
  timezone            text,                         -- IANA tz, e.g. 'Asia/Shanghai'
  locale              text NOT NULL DEFAULT 'en',
  preferred_language  text NOT NULL DEFAULT 'en',   -- drives message translation
  phone               text,
  bio                 text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Link to Supabase Auth. Added separately + guarded so these migrations still
-- run on a vanilla Postgres that has no `auth` schema (e.g. local CI).
-- ON DELETE CASCADE: deleting the auth user tears down their profile graph.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'auth' AND table_name = 'users')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_fkey')
  THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles (role);
-- Trigram index for typeahead search on names.
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
  ON profiles USING gin (display_name gin_trgm_ops);

-- Triggers
CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
