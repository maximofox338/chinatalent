-- 006_listings.sql
-- UNIFIED listings: a single table with a `type` discriminator
-- ('freelance' | 'fulltime'). Type-specific columns live in sibling 1:1
-- detail tables (freelance_details / fulltime_details) so the core table stays
-- lean and shared concerns (status, skills, saves) work uniformly across both.

CREATE TABLE IF NOT EXISTS listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES company_profiles (id) ON DELETE CASCADE,
  posted_by       uuid REFERENCES profiles (id) ON DELETE SET NULL,
  -- Discriminator. Drives which detail table applies.
  type            text NOT NULL CHECK (type IN ('freelance', 'fulltime')),
  title           text NOT NULL,
  description     text,
  category_id     uuid REFERENCES categories (id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'open', 'paused', 'closed', 'filled')),
  location_type   text NOT NULL DEFAULT 'remote'
                    CHECK (location_type IN ('remote', 'hybrid', 'onsite')),
  location_country text,                            -- ISO 3166-1 alpha-2
  currency        text NOT NULL DEFAULT 'USD',
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Public browse queries filter by status + type + category; partial index on
-- the hot path (only open listings are publicly searched).
CREATE INDEX IF NOT EXISTS idx_listings_open
  ON listings (type, category_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_listings_company ON listings (company_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_title_trgm
  ON listings USING gin (title gin_trgm_ops);

CREATE OR REPLACE TRIGGER trg_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Freelance-specific terms (1:1 with a listing where type = 'freelance').
CREATE TABLE IF NOT EXISTS freelance_details (
  listing_id              uuid PRIMARY KEY
                            REFERENCES listings (id) ON DELETE CASCADE,
  budget_type             text NOT NULL DEFAULT 'fixed'
                            CHECK (budget_type IN ('fixed', 'hourly')),
  budget_min              numeric(12, 2) CHECK (budget_min IS NULL OR budget_min >= 0),
  budget_max              numeric(12, 2) CHECK (budget_max IS NULL OR budget_max >= 0),
  estimated_hours         int CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  estimated_duration_weeks int CHECK (estimated_duration_weeks IS NULL OR estimated_duration_weeks >= 0),
  deadline                date,
  CHECK (budget_max IS NULL OR budget_min IS NULL OR budget_max >= budget_min)
);

-- Full-time-specific terms (1:1 with a listing where type = 'fulltime').
CREATE TABLE IF NOT EXISTS fulltime_details (
  listing_id        uuid PRIMARY KEY
                      REFERENCES listings (id) ON DELETE CASCADE,
  employment_type   text NOT NULL DEFAULT 'full_time'
                      CHECK (employment_type IN ('full_time', 'part_time', 'contract')),
  salary_min        numeric(12, 2) CHECK (salary_min IS NULL OR salary_min >= 0),
  salary_max        numeric(12, 2) CHECK (salary_max IS NULL OR salary_max >= 0),
  salary_period     text NOT NULL DEFAULT 'year'
                      CHECK (salary_period IN ('year', 'month', 'hour')),
  seniority         text CHECK (seniority IS NULL OR seniority IN
                      ('intern', 'junior', 'mid', 'senior', 'lead', 'principal')),
  benefits          text,
  CHECK (salary_max IS NULL OR salary_min IS NULL OR salary_max >= salary_min)
);

-- Skills a listing asks for.
CREATE TABLE IF NOT EXISTS listing_skills (
  listing_id  uuid NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  skill_id    uuid NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT true,
  PRIMARY KEY (listing_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_skills_skill ON listing_skills (skill_id);

-- A worker's bookmarked listings.
CREATE TABLE IF NOT EXISTS saved_listings (
  profile_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  listing_id  uuid NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, listing_id)
);
