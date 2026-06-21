-- 014_notifications_audit.sql
-- Per-user notifications and an append-only audit log.

CREATE TABLE IF NOT EXISTS notifications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  type                  text NOT NULL,              -- e.g. 'offer.received'
  title                 text NOT NULL,
  body                  text,
  data                  jsonb NOT NULL DEFAULT '{}'::jsonb,  -- structured payload
  is_read               boolean NOT NULL DEFAULT false,
  read_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Inbox query: a recipient's unread/recent notifications.
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications (recipient_profile_id, created_at DESC)
  WHERE is_read = false;

-- Append-only audit trail. WHY no updated_at / no trigger: audit rows are
-- immutable by design; RLS (015) forbids UPDATE/DELETE for non-service callers.
CREATE TABLE IF NOT EXISTS audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  action        text NOT NULL,                      -- e.g. 'offer.accepted'
  entity_type   text,                               -- e.g. 'offers'
  entity_id     uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address    inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_profile_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
