-- 010_messaging.sql
-- Conversations, their participants, messages, and cached translations.
-- Access control is strict: only participants may read a conversation's
-- messages (enforced via RLS in 015, using is_conversation_participant()).

CREATE TABLE IF NOT EXISTS conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject       text,
  -- Optional context the conversation is attached to.
  listing_id    uuid REFERENCES listings (id) ON DELETE SET NULL,
  engagement_id uuid REFERENCES engagements (id) ON DELETE SET NULL,
  created_by    uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Membership in a conversation. This table is the access-control gate.
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  -- Read receipts: everything created at/before this is "read".
  last_read_at    timestamptz,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_profile
  ON conversation_participants (profile_id);

CREATE TABLE IF NOT EXISTS messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id         uuid REFERENCES profiles (id) ON DELETE SET NULL,
  body              text NOT NULL,
  original_language text,                           -- BCP-47, e.g. 'zh', 'en'
  created_at        timestamptz NOT NULL DEFAULT now(),
  edited_at         timestamptz,
  -- Soft delete so a removed message can stay referenced by translations/audit.
  deleted_at        timestamptz
);

-- Primary access pattern: fetch a conversation's messages newest-first.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC);

-- Cached machine translations of a message (Google Cloud Translate). One row
-- per target language; we never re-translate the same (message, language).
CREATE TABLE IF NOT EXISTS message_translations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  target_language text NOT NULL,                    -- BCP-47
  translated_body text NOT NULL,
  provider        text NOT NULL DEFAULT 'google',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, target_language)
);
