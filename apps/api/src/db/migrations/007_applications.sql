-- 007_applications.sql
-- A worker's application to a listing. One application per (listing, worker).

CREATE TABLE IF NOT EXISTS applications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        uuid NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  worker_profile_id uuid NOT NULL
                      REFERENCES worker_profiles (id) ON DELETE CASCADE,
  cover_letter      text,
  -- What the worker proposes to be paid; interpretation depends on listing type
  -- (hourly/fixed for freelance, salary for full-time).
  proposed_rate     numeric(12, 2) CHECK (proposed_rate IS NULL OR proposed_rate >= 0),
  status            text NOT NULL DEFAULT 'submitted'
                      CHECK (status IN
                        ('submitted', 'reviewing', 'shortlisted', 'rejected',
                         'withdrawn', 'offered', 'hired')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- A worker can apply to a given listing only once.
  UNIQUE (listing_id, worker_profile_id)
);

-- Employer view: applications for a listing, filtered by status.
CREATE INDEX IF NOT EXISTS idx_applications_listing_status
  ON applications (listing_id, status);
-- Worker view: "my applications".
CREATE INDEX IF NOT EXISTS idx_applications_worker
  ON applications (worker_profile_id);

CREATE OR REPLACE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
