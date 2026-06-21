-- 013_trust_safety.sql
-- Reviews between engaged parties, disputes, and KYC/verification documents.

-- A review is written by one party of an engagement about the other. One review
-- per (engagement, author).
CREATE TABLE IF NOT EXISTS reviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id       uuid NOT NULL REFERENCES engagements (id) ON DELETE CASCADE,
  author_profile_id   uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  subject_profile_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  rating              int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment             text,
  is_public           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, author_profile_id),
  CHECK (author_profile_id <> subject_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_subject ON reviews (subject_profile_id);
CREATE INDEX IF NOT EXISTS idx_reviews_engagement ON reviews (engagement_id);

CREATE OR REPLACE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A formal dispute over an engagement or invoice.
CREATE TABLE IF NOT EXISTS disputes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id       uuid REFERENCES engagements (id) ON DELETE SET NULL,
  invoice_id          uuid REFERENCES invoices (id) ON DELETE SET NULL,
  raised_by           uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  against_profile_id  uuid REFERENCES profiles (id) ON DELETE SET NULL,
  reason              text NOT NULL,
  description         text,
  status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN
                          ('open', 'under_review', 'resolved', 'rejected', 'withdrawn')),
  resolution          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_disputes_raised_by ON disputes (raised_by);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status);

CREATE OR REPLACE TRIGGER trg_disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- KYC / verification documents. Highly sensitive PII: RLS (015) restricts reads
-- to the owning profile and admins only.
CREATE TABLE IF NOT EXISTS verification_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  company_id    uuid REFERENCES company_profiles (id) ON DELETE CASCADE,
  doc_type      text NOT NULL
                  CHECK (doc_type IN
                    ('id', 'passport', 'business_license', 'address_proof', 'other')),
  file_url      text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   uuid REFERENCES profiles (id) ON DELETE SET NULL,
  review_notes  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_verification_documents_profile
  ON verification_documents (profile_id);
CREATE INDEX IF NOT EXISTS idx_verification_documents_status
  ON verification_documents (status);

CREATE OR REPLACE TRIGGER trg_verification_documents_updated_at
  BEFORE UPDATE ON verification_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
