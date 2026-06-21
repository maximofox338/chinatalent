-- 012_subscriptions.sql
-- Premium plans for the "premium tools and services" revenue stream. A
-- subscription belongs to either an individual profile or a company (XOR).

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_profile_id   uuid REFERENCES profiles (id) ON DELETE CASCADE,
  company_id              uuid REFERENCES company_profiles (id) ON DELETE CASCADE,
  plan                    text NOT NULL DEFAULT 'free'
                            CHECK (plan IN ('free', 'pro', 'enterprise')),
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN
                              ('active', 'trialing', 'past_due', 'canceled')),
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  provider                text,                     -- e.g. 'stripe'
  provider_subscription_id text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  -- A subscription is owned by a person or a company, exactly one.
  CHECK ((subscriber_profile_id IS NOT NULL) <> (company_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_profile ON subscriptions (subscriber_profile_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_company ON subscriptions (company_id);

CREATE OR REPLACE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
