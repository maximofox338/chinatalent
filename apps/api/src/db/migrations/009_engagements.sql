-- 009_engagements.sql
-- THE REVENUE SPINE. An engagement is a live working relationship created when
-- an offer is accepted. Billing (011) and reviews/disputes (013) all reference
-- it.
--
-- WHY fee rates are columns here (and not looked up live): they are SNAPSHOTTED
-- at engagement creation. If the platform later changes its pricing, existing
-- engagements keep billing at the rate the parties agreed to. This is the
-- single most important data-integrity decision in the financial model.

CREATE TABLE IF NOT EXISTS engagements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id              uuid REFERENCES offers (id) ON DELETE SET NULL,
  listing_id            uuid REFERENCES listings (id) ON DELETE SET NULL,
  company_id            uuid NOT NULL REFERENCES company_profiles (id) ON DELETE RESTRICT,
  worker_profile_id     uuid NOT NULL
                          REFERENCES worker_profiles (id) ON DELETE RESTRICT,
  type                  text NOT NULL CHECK (type IN ('freelance', 'fulltime')),
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'paused', 'completed', 'terminated')),
  start_date            date NOT NULL DEFAULT CURRENT_DATE,
  end_date              date,
  compensation_amount   numeric(12, 2) NOT NULL CHECK (compensation_amount >= 0),
  compensation_period   text NOT NULL DEFAULT 'year'
                          CHECK (compensation_period IN ('year', 'month', 'hour', 'fixed')),
  currency              text NOT NULL DEFAULT 'USD',

  -- --- Snapshotted fee rates (fractions, e.g. 0.1000 = 10%) ---
  -- 10% commission on first-year salary (employment placement).
  placement_fee_rate    numeric(5, 4) NOT NULL DEFAULT 0.1000
                          CHECK (placement_fee_rate >= 0 AND placement_fee_rate <= 1),
  -- 5% recurring annual retention fee.
  recurring_fee_rate    numeric(5, 4) NOT NULL DEFAULT 0.0500
                          CHECK (recurring_fee_rate >= 0 AND recurring_fee_rate <= 1),
  -- 1-2% payroll processing fee.
  payroll_fee_rate      numeric(5, 4) NOT NULL DEFAULT 0.0200
                          CHECK (payroll_fee_rate >= 0 AND payroll_fee_rate <= 1),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_engagements_company ON engagements (company_id);
CREATE INDEX IF NOT EXISTS idx_engagements_worker ON engagements (worker_profile_id);
CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements (status);

CREATE OR REPLACE TRIGGER trg_engagements_updated_at
  BEFORE UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
