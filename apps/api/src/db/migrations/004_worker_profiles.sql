-- 004_worker_profiles.sql
-- The worker-facing extension of a profile, plus the worker<->skill join.
-- One worker_profile per profile (enforced by UNIQUE on profile_id).

CREATE TABLE IF NOT EXISTS worker_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          uuid NOT NULL UNIQUE
                        REFERENCES profiles (id) ON DELETE CASCADE,
  headline            text,
  summary             text,
  years_experience    int  CHECK (years_experience IS NULL OR years_experience >= 0),
  hourly_rate_usd     numeric(10, 2) CHECK (hourly_rate_usd IS NULL OR hourly_rate_usd >= 0),
  availability        text NOT NULL DEFAULT 'not_available'
                        CHECK (availability IN
                          ('full_time', 'part_time', 'freelance', 'not_available')),
  english_level       text CHECK (english_level IS NULL OR english_level IN
                          ('basic', 'conversational', 'professional', 'fluent', 'native')),
  chinese_level       text CHECK (chinese_level IS NULL OR chinese_level IN
                          ('basic', 'conversational', 'professional', 'fluent', 'native')),
  open_to_relocation  boolean NOT NULL DEFAULT false,
  portfolio_url       text,
  resume_url          text,
  -- Verified by the trust & safety team (verification_documents in 013).
  is_verified         boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_profiles_availability
  ON worker_profiles (availability);

CREATE OR REPLACE TRIGGER trg_worker_profiles_updated_at
  BEFORE UPDATE ON worker_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Worker <-> skill, with self-rated proficiency.
CREATE TABLE IF NOT EXISTS worker_skills (
  worker_profile_id uuid NOT NULL
                      REFERENCES worker_profiles (id) ON DELETE CASCADE,
  skill_id          uuid NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  proficiency       text NOT NULL DEFAULT 'intermediate'
                      CHECK (proficiency IN
                        ('beginner', 'intermediate', 'advanced', 'expert')),
  years             int CHECK (years IS NULL OR years >= 0),
  PRIMARY KEY (worker_profile_id, skill_id)
);

-- Reverse lookup: "who has skill X?".
CREATE INDEX IF NOT EXISTS idx_worker_skills_skill_id ON worker_skills (skill_id);
