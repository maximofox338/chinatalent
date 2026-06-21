-- 008_offers.sql
-- A formal offer from a company to a worker. May originate from an application
-- (application_id set) or be a direct/sourced offer (application_id NULL).
-- An accepted offer is what spawns an engagement (009).

CREATE TABLE IF NOT EXISTS offers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id        uuid REFERENCES applications (id) ON DELETE SET NULL,
  listing_id            uuid REFERENCES listings (id) ON DELETE SET NULL,
  company_id            uuid NOT NULL REFERENCES company_profiles (id) ON DELETE CASCADE,
  worker_profile_id     uuid NOT NULL
                          REFERENCES worker_profiles (id) ON DELETE CASCADE,
  type                  text NOT NULL CHECK (type IN ('freelance', 'fulltime')),
  compensation_amount   numeric(12, 2) NOT NULL CHECK (compensation_amount >= 0),
  compensation_period   text NOT NULL DEFAULT 'year'
                          CHECK (compensation_period IN ('year', 'month', 'hour', 'fixed')),
  currency              text NOT NULL DEFAULT 'USD',
  start_date            date,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN
                            ('draft', 'sent', 'accepted', 'declined',
                             'rescinded', 'expired')),
  expires_at            timestamptz,
  terms                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offers_worker ON offers (worker_profile_id);
CREATE INDEX IF NOT EXISTS idx_offers_company ON offers (company_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers (status);

CREATE OR REPLACE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
