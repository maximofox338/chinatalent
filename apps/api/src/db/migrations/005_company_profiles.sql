-- 005_company_profiles.sql
-- Employer organizations, plus the membership table that grants profiles
-- access to act on behalf of a company. company_members is the source of
-- truth for "can this user manage this company's listings / offers / billing".

CREATE TABLE IF NOT EXISTS company_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The profile that created the company. Kept for provenance; day-to-day
  -- authorization goes through company_members.
  owner_profile_id      uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  name                  text NOT NULL,
  slug                  text NOT NULL UNIQUE,
  website               text,
  description           text,
  industry              text,
  size                  text CHECK (size IS NULL OR size IN
                          ('1-10', '11-50', '51-200', '201-500', '501-1000', '1000+')),
  headquarters_country  text,                       -- ISO 3166-1 alpha-2
  logo_url              text,
  is_verified           boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_profiles_owner ON company_profiles (owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_company_profiles_name_trgm
  ON company_profiles USING gin (name gin_trgm_ops);

CREATE OR REPLACE TRIGGER trg_company_profiles_updated_at
  BEFORE UPDATE ON company_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A profile's seat at a company, with a role that scopes what they can do.
CREATE TABLE IF NOT EXISTS company_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES company_profiles (id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner', 'admin', 'recruiter', 'member')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- A profile holds at most one seat per company.
  UNIQUE (company_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_profile ON company_members (profile_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company ON company_members (company_id);
