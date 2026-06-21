-- 011_billing.sql
-- Money movement. invoices = amounts the platform charges a company;
-- payroll_runs = periodic worker pay (gross/fee/net); payments = concrete
-- transactions that settle either an invoice or a payroll run.
-- All highly sensitive: RLS (015) restricts to the company/worker involved.

CREATE TABLE IF NOT EXISTS invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   uuid REFERENCES engagements (id) ON DELETE SET NULL,
  company_id      uuid NOT NULL REFERENCES company_profiles (id) ON DELETE RESTRICT,
  invoice_number  text NOT NULL UNIQUE,
  -- Which revenue stream this invoice represents.
  type            text NOT NULL
                    CHECK (type IN
                      ('placement_fee', 'recurring_fee', 'payroll_fee', 'subscription')),
  amount          numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency        text NOT NULL DEFAULT 'USD',
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'paid', 'void', 'overdue')),
  issued_at       timestamptz,
  due_at          timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices (company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_engagement ON invoices (engagement_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);

CREATE OR REPLACE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS payroll_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id     uuid NOT NULL REFERENCES engagements (id) ON DELETE RESTRICT,
  company_id        uuid NOT NULL REFERENCES company_profiles (id) ON DELETE RESTRICT,
  worker_profile_id uuid NOT NULL REFERENCES worker_profiles (id) ON DELETE RESTRICT,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  gross_amount      numeric(12, 2) NOT NULL CHECK (gross_amount >= 0),
  fee_amount        numeric(12, 2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount        numeric(12, 2) NOT NULL CHECK (net_amount >= 0),
  currency          text NOT NULL DEFAULT 'USD',
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_engagement ON payroll_runs (engagement_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_worker ON payroll_runs (worker_profile_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_company ON payroll_runs (company_id);

CREATE OR REPLACE TRIGGER trg_payroll_runs_updated_at
  BEFORE UPDATE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A concrete transaction. Exactly one of invoice_id / payroll_run_id is the
-- thing being settled (a loose XOR, enforced by the CHECK below).
CREATE TABLE IF NOT EXISTS payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          uuid REFERENCES invoices (id) ON DELETE SET NULL,
  payroll_run_id      uuid REFERENCES payroll_runs (id) ON DELETE SET NULL,
  payer_profile_id    uuid REFERENCES profiles (id) ON DELETE SET NULL,
  payee_profile_id    uuid REFERENCES profiles (id) ON DELETE SET NULL,
  amount              numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency            text NOT NULL DEFAULT 'USD',
  direction           text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  provider            text,                         -- e.g. 'stripe', 'wise'
  provider_reference  text,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- A payment settles an invoice or a payroll run, not both, not neither.
  CHECK ((invoice_id IS NOT NULL) <> (payroll_run_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_payroll_run ON payments (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments (payer_profile_id);
CREATE INDEX IF NOT EXISTS idx_payments_payee ON payments (payee_profile_id);

CREATE OR REPLACE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
