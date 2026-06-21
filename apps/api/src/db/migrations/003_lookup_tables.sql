-- 003_lookup_tables.sql
-- Reference data: categories (top-level domains) and skills (tags within them).
-- These are world-readable and only writable by admins (see RLS in 015).

CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,           -- stable machine key, e.g. 'software-engineering'
  name        text NOT NULL,
  description text,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories (id) ON DELETE SET NULL,
  slug        text NOT NULL UNIQUE,           -- e.g. 'typescript'
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skills_category_id ON skills (category_id);
-- Trigram index for skill typeahead.
CREATE INDEX IF NOT EXISTS idx_skills_name_trgm
  ON skills USING gin (name gin_trgm_ops);
