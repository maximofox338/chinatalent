-- 015_rls_policies.sql
-- =====================================================================
-- ROW LEVEL SECURITY — the platform's #1 security control.
-- =====================================================================
-- Strategy (the Supabase model):
--   1. GRANT table privileges to the anon / authenticated roles so they can
--      reach the tables at all.
--   2. ENABLE (and FORCE) RLS on every table, so access is default-DENY.
--   3. Add precise per-operation policies that re-open only the rows a caller
--      is entitled to.
--
-- All authorization predicates live in SECURITY DEFINER helper functions.
-- WHY SECURITY DEFINER: a policy on company_members that itself queries
-- company_members would recurse infinitely under RLS. Running the check as the
-- table owner (which bypasses RLS) breaks that cycle. search_path is pinned to
-- prevent search-path hijacking of a definer-rights function.
--
-- Idempotent: every policy is DROP ... IF EXISTS then CREATE.

-- ---------------------------------------------------------------------------
-- Privilege grants (RLS still filters rows after these)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Authenticated users may attempt all DML; policies decide which rows succeed.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Anonymous (logged-out) visitors may only read the publicly browsable surface.
GRANT SELECT ON
  categories, skills, company_profiles,
  listings, freelance_details, fulltime_details, listing_skills
TO anon;

-- service_role is the trusted backend; it also has BYPASSRLS from 001.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Keep grants working for anything created later in the public schema.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

-- ---------------------------------------------------------------------------
-- Authorization helper functions (SECURITY DEFINER, RLS-bypassing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = app_current_user_id() AND role = 'admin'
  );
$$;

-- True if the caller owns the given worker_profile.
CREATE OR REPLACE FUNCTION owns_worker_profile(p_worker_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM worker_profiles
    WHERE id = p_worker_profile_id AND profile_id = app_current_user_id()
  );
$$;

-- True if the caller holds any seat at the company.
CREATE OR REPLACE FUNCTION is_company_member(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id AND profile_id = app_current_user_id()
  );
$$;

-- True if the caller is an owner/admin of the company (manage members, settings).
CREATE OR REPLACE FUNCTION is_company_admin(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id
      AND profile_id = app_current_user_id()
      AND role IN ('owner', 'admin')
  );
$$;

-- True if the caller is a participant in the conversation.
CREATE OR REPLACE FUNCTION is_conversation_participant(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id
      AND profile_id = app_current_user_id()
  );
$$;

-- Visibility test for a listing: open to the world, or visible to its company.
CREATE OR REPLACE FUNCTION can_read_listing(p_listing_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM listings l
    WHERE l.id = p_listing_id
      AND (l.status = 'open' OR is_company_member(l.company_id))
  );
$$;

-- Management test for a listing: caller is a member of the owning company.
CREATE OR REPLACE FUNCTION can_manage_listing(p_listing_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM listings l
    WHERE l.id = p_listing_id AND is_company_member(l.company_id)
  );
$$;

GRANT EXECUTE ON FUNCTION
  app_current_user_id(), app_is_authenticated(), is_admin(),
  owns_worker_profile(uuid), is_company_member(uuid), is_company_admin(uuid),
  is_conversation_participant(uuid), can_read_listing(uuid), can_manage_listing(uuid)
TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable + FORCE RLS on every table.
-- FORCE so that even the table owner is subject to policies — defense in depth.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles', 'categories', 'skills', 'worker_profiles', 'worker_skills',
    'company_profiles', 'company_members', 'listings', 'freelance_details',
    'fulltime_details', 'listing_skills', 'saved_listings', 'applications',
    'offers', 'engagements', 'conversations', 'conversation_participants',
    'messages', 'message_translations', 'invoices', 'payroll_runs', 'payments',
    'subscriptions', 'reviews', 'disputes', 'verification_documents',
    'notifications', 'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END
$$;

-- ===========================================================================
-- POLICIES
-- ===========================================================================

-- ----- profiles -----------------------------------------------------------
-- A user sees only their own profile (or admins see all). Public-facing display
-- data is surfaced through dedicated views, not by opening this table.
DROP POLICY IF EXISTS profiles_select_self ON profiles;
CREATE POLICY profiles_select_self ON profiles FOR SELECT TO authenticated
  USING (id = app_current_user_id() OR is_admin());

DROP POLICY IF EXISTS profiles_insert_self ON profiles;
CREATE POLICY profiles_insert_self ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = app_current_user_id());

DROP POLICY IF EXISTS profiles_update_self ON profiles;
CREATE POLICY profiles_update_self ON profiles FOR UPDATE TO authenticated
  USING (id = app_current_user_id() OR is_admin())
  WITH CHECK (id = app_current_user_id() OR is_admin());

-- ----- categories / skills (public read, admin write) ---------------------
DROP POLICY IF EXISTS categories_select_all ON categories;
CREATE POLICY categories_select_all ON categories FOR SELECT TO anon, authenticated
  USING (true);
DROP POLICY IF EXISTS categories_write_admin ON categories;
CREATE POLICY categories_write_admin ON categories FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS skills_select_all ON skills;
CREATE POLICY skills_select_all ON skills FOR SELECT TO anon, authenticated
  USING (true);
DROP POLICY IF EXISTS skills_write_admin ON skills;
CREATE POLICY skills_write_admin ON skills FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ----- worker_profiles (talent directory: readable by signed-in users) ----
DROP POLICY IF EXISTS worker_profiles_select ON worker_profiles;
CREATE POLICY worker_profiles_select ON worker_profiles FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS worker_profiles_insert_self ON worker_profiles;
CREATE POLICY worker_profiles_insert_self ON worker_profiles FOR INSERT TO authenticated
  WITH CHECK (profile_id = app_current_user_id());
DROP POLICY IF EXISTS worker_profiles_update_self ON worker_profiles;
CREATE POLICY worker_profiles_update_self ON worker_profiles FOR UPDATE TO authenticated
  USING (profile_id = app_current_user_id() OR is_admin())
  WITH CHECK (profile_id = app_current_user_id() OR is_admin());
DROP POLICY IF EXISTS worker_profiles_delete_self ON worker_profiles;
CREATE POLICY worker_profiles_delete_self ON worker_profiles FOR DELETE TO authenticated
  USING (profile_id = app_current_user_id() OR is_admin());

-- ----- worker_skills ------------------------------------------------------
DROP POLICY IF EXISTS worker_skills_select ON worker_skills;
CREATE POLICY worker_skills_select ON worker_skills FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS worker_skills_write_owner ON worker_skills;
CREATE POLICY worker_skills_write_owner ON worker_skills FOR ALL TO authenticated
  USING (owns_worker_profile(worker_profile_id))
  WITH CHECK (owns_worker_profile(worker_profile_id));

-- ----- company_profiles ---------------------------------------------------
DROP POLICY IF EXISTS company_profiles_select_all ON company_profiles;
CREATE POLICY company_profiles_select_all ON company_profiles FOR SELECT TO anon, authenticated
  USING (true);
DROP POLICY IF EXISTS company_profiles_insert_self ON company_profiles;
CREATE POLICY company_profiles_insert_self ON company_profiles FOR INSERT TO authenticated
  WITH CHECK (owner_profile_id = app_current_user_id());
DROP POLICY IF EXISTS company_profiles_update_admin ON company_profiles;
CREATE POLICY company_profiles_update_admin ON company_profiles FOR UPDATE TO authenticated
  USING (is_company_admin(id) OR is_admin())
  WITH CHECK (is_company_admin(id) OR is_admin());

-- ----- company_members ----------------------------------------------------
DROP POLICY IF EXISTS company_members_select ON company_members;
CREATE POLICY company_members_select ON company_members FOR SELECT TO authenticated
  USING (profile_id = app_current_user_id() OR is_company_member(company_id) OR is_admin());
DROP POLICY IF EXISTS company_members_write_admin ON company_members;
CREATE POLICY company_members_write_admin ON company_members FOR ALL TO authenticated
  USING (is_company_admin(company_id) OR is_admin())
  WITH CHECK (is_company_admin(company_id) OR is_admin());

-- ----- listings -----------------------------------------------------------
-- Anyone (including logged-out) can read OPEN listings. Company members also
-- see their own drafts/paused/closed. Only members can write.
DROP POLICY IF EXISTS listings_select ON listings;
CREATE POLICY listings_select ON listings FOR SELECT TO anon, authenticated
  USING (status = 'open' OR is_company_member(company_id));
DROP POLICY IF EXISTS listings_insert_member ON listings;
CREATE POLICY listings_insert_member ON listings FOR INSERT TO authenticated
  WITH CHECK (is_company_member(company_id));
DROP POLICY IF EXISTS listings_update_member ON listings;
CREATE POLICY listings_update_member ON listings FOR UPDATE TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));
DROP POLICY IF EXISTS listings_delete_member ON listings;
CREATE POLICY listings_delete_member ON listings FOR DELETE TO authenticated
  USING (is_company_member(company_id));

-- ----- freelance_details / fulltime_details (follow listing visibility) ---
DROP POLICY IF EXISTS freelance_details_select ON freelance_details;
CREATE POLICY freelance_details_select ON freelance_details FOR SELECT TO anon, authenticated
  USING (can_read_listing(listing_id));
DROP POLICY IF EXISTS freelance_details_write ON freelance_details;
CREATE POLICY freelance_details_write ON freelance_details FOR ALL TO authenticated
  USING (can_manage_listing(listing_id)) WITH CHECK (can_manage_listing(listing_id));

DROP POLICY IF EXISTS fulltime_details_select ON fulltime_details;
CREATE POLICY fulltime_details_select ON fulltime_details FOR SELECT TO anon, authenticated
  USING (can_read_listing(listing_id));
DROP POLICY IF EXISTS fulltime_details_write ON fulltime_details;
CREATE POLICY fulltime_details_write ON fulltime_details FOR ALL TO authenticated
  USING (can_manage_listing(listing_id)) WITH CHECK (can_manage_listing(listing_id));

-- ----- listing_skills -----------------------------------------------------
DROP POLICY IF EXISTS listing_skills_select ON listing_skills;
CREATE POLICY listing_skills_select ON listing_skills FOR SELECT TO anon, authenticated
  USING (can_read_listing(listing_id));
DROP POLICY IF EXISTS listing_skills_write ON listing_skills;
CREATE POLICY listing_skills_write ON listing_skills FOR ALL TO authenticated
  USING (can_manage_listing(listing_id)) WITH CHECK (can_manage_listing(listing_id));

-- ----- saved_listings (private to the saver) ------------------------------
DROP POLICY IF EXISTS saved_listings_own ON saved_listings;
CREATE POLICY saved_listings_own ON saved_listings FOR ALL TO authenticated
  USING (profile_id = app_current_user_id())
  WITH CHECK (profile_id = app_current_user_id());

-- ----- applications -------------------------------------------------------
-- Visible to the applying worker and to the hiring company. Workers create and
-- may update (withdraw) their own; companies may update status.
DROP POLICY IF EXISTS applications_select ON applications;
CREATE POLICY applications_select ON applications FOR SELECT TO authenticated
  USING (owns_worker_profile(worker_profile_id) OR can_manage_listing(listing_id) OR is_admin());
DROP POLICY IF EXISTS applications_insert_worker ON applications;
CREATE POLICY applications_insert_worker ON applications FOR INSERT TO authenticated
  WITH CHECK (owns_worker_profile(worker_profile_id));
DROP POLICY IF EXISTS applications_update ON applications;
CREATE POLICY applications_update ON applications FOR UPDATE TO authenticated
  USING (owns_worker_profile(worker_profile_id) OR can_manage_listing(listing_id))
  WITH CHECK (owns_worker_profile(worker_profile_id) OR can_manage_listing(listing_id));

-- ----- offers -------------------------------------------------------------
-- Company creates/edits; worker can read and update status (accept/decline).
DROP POLICY IF EXISTS offers_select ON offers;
CREATE POLICY offers_select ON offers FOR SELECT TO authenticated
  USING (owns_worker_profile(worker_profile_id) OR is_company_member(company_id) OR is_admin());
DROP POLICY IF EXISTS offers_insert_company ON offers;
CREATE POLICY offers_insert_company ON offers FOR INSERT TO authenticated
  WITH CHECK (is_company_member(company_id));
DROP POLICY IF EXISTS offers_update ON offers;
CREATE POLICY offers_update ON offers FOR UPDATE TO authenticated
  USING (is_company_member(company_id) OR owns_worker_profile(worker_profile_id))
  WITH CHECK (is_company_member(company_id) OR owns_worker_profile(worker_profile_id));

-- ----- engagements (revenue spine) ----------------------------------------
DROP POLICY IF EXISTS engagements_select ON engagements;
CREATE POLICY engagements_select ON engagements FOR SELECT TO authenticated
  USING (owns_worker_profile(worker_profile_id) OR is_company_member(company_id) OR is_admin());
DROP POLICY IF EXISTS engagements_insert_company ON engagements;
CREATE POLICY engagements_insert_company ON engagements FOR INSERT TO authenticated
  WITH CHECK (is_company_member(company_id));
DROP POLICY IF EXISTS engagements_update_company ON engagements;
CREATE POLICY engagements_update_company ON engagements FOR UPDATE TO authenticated
  USING (is_company_member(company_id) OR is_admin())
  WITH CHECK (is_company_member(company_id) OR is_admin());

-- ----- conversations / participants / messages ----------------------------
DROP POLICY IF EXISTS conversations_select ON conversations;
CREATE POLICY conversations_select ON conversations FOR SELECT TO authenticated
  USING (is_conversation_participant(id) OR is_admin());
DROP POLICY IF EXISTS conversations_insert ON conversations;
CREATE POLICY conversations_insert ON conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = app_current_user_id());
DROP POLICY IF EXISTS conversations_update ON conversations;
CREATE POLICY conversations_update ON conversations FOR UPDATE TO authenticated
  USING (is_conversation_participant(id))
  WITH CHECK (is_conversation_participant(id));

DROP POLICY IF EXISTS conv_participants_select ON conversation_participants;
CREATE POLICY conv_participants_select ON conversation_participants FOR SELECT TO authenticated
  USING (is_conversation_participant(conversation_id) OR is_admin());
-- Allow joining yourself, or an existing participant adding others.
DROP POLICY IF EXISTS conv_participants_insert ON conversation_participants;
CREATE POLICY conv_participants_insert ON conversation_participants FOR INSERT TO authenticated
  WITH CHECK (profile_id = app_current_user_id() OR is_conversation_participant(conversation_id));
DROP POLICY IF EXISTS conv_participants_delete ON conversation_participants;
CREATE POLICY conv_participants_delete ON conversation_participants FOR DELETE TO authenticated
  USING (profile_id = app_current_user_id() OR is_conversation_participant(conversation_id));

DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages FOR SELECT TO authenticated
  USING (is_conversation_participant(conversation_id) OR is_admin());
DROP POLICY IF EXISTS messages_insert ON messages;
CREATE POLICY messages_insert ON messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = app_current_user_id() AND is_conversation_participant(conversation_id));
DROP POLICY IF EXISTS messages_update_sender ON messages;
CREATE POLICY messages_update_sender ON messages FOR UPDATE TO authenticated
  USING (sender_id = app_current_user_id())
  WITH CHECK (sender_id = app_current_user_id());

DROP POLICY IF EXISTS message_translations_select ON message_translations;
CREATE POLICY message_translations_select ON message_translations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_translations.message_id
      AND is_conversation_participant(m.conversation_id)
  ));
DROP POLICY IF EXISTS message_translations_insert ON message_translations;
CREATE POLICY message_translations_insert ON message_translations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_translations.message_id
      AND is_conversation_participant(m.conversation_id)
  ));

-- ----- invoices / payroll_runs / payments (financial: parties only) --------
-- Reads only; writes are service_role/admin (no authenticated write policy).
DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices FOR SELECT TO authenticated
  USING (is_company_member(company_id) OR is_admin());
DROP POLICY IF EXISTS invoices_write_admin ON invoices;
CREATE POLICY invoices_write_admin ON invoices FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS payroll_runs_select ON payroll_runs;
CREATE POLICY payroll_runs_select ON payroll_runs FOR SELECT TO authenticated
  USING (owns_worker_profile(worker_profile_id) OR is_company_member(company_id) OR is_admin());
DROP POLICY IF EXISTS payroll_runs_write_admin ON payroll_runs;
CREATE POLICY payroll_runs_write_admin ON payroll_runs FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments FOR SELECT TO authenticated
  USING (
    payer_profile_id = app_current_user_id()
    OR payee_profile_id = app_current_user_id()
    OR is_admin()
    OR EXISTS (SELECT 1 FROM invoices i
               WHERE i.id = payments.invoice_id AND is_company_member(i.company_id))
    OR EXISTS (SELECT 1 FROM payroll_runs pr
               WHERE pr.id = payments.payroll_run_id
                 AND (owns_worker_profile(pr.worker_profile_id) OR is_company_member(pr.company_id)))
  );
DROP POLICY IF EXISTS payments_write_admin ON payments;
CREATE POLICY payments_write_admin ON payments FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ----- subscriptions ------------------------------------------------------
DROP POLICY IF EXISTS subscriptions_select ON subscriptions;
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT TO authenticated
  USING (
    subscriber_profile_id = app_current_user_id()
    OR (company_id IS NOT NULL AND is_company_member(company_id))
    OR is_admin()
  );
DROP POLICY IF EXISTS subscriptions_write ON subscriptions;
CREATE POLICY subscriptions_write ON subscriptions FOR ALL TO authenticated
  USING (
    subscriber_profile_id = app_current_user_id()
    OR (company_id IS NOT NULL AND is_company_admin(company_id))
    OR is_admin()
  )
  WITH CHECK (
    subscriber_profile_id = app_current_user_id()
    OR (company_id IS NOT NULL AND is_company_admin(company_id))
    OR is_admin()
  );

-- ----- reviews ------------------------------------------------------------
DROP POLICY IF EXISTS reviews_select ON reviews;
CREATE POLICY reviews_select ON reviews FOR SELECT TO authenticated
  USING (is_public OR author_profile_id = app_current_user_id()
         OR subject_profile_id = app_current_user_id() OR is_admin());
DROP POLICY IF EXISTS reviews_insert_author ON reviews;
CREATE POLICY reviews_insert_author ON reviews FOR INSERT TO authenticated
  WITH CHECK (author_profile_id = app_current_user_id());
DROP POLICY IF EXISTS reviews_update_author ON reviews;
CREATE POLICY reviews_update_author ON reviews FOR UPDATE TO authenticated
  USING (author_profile_id = app_current_user_id())
  WITH CHECK (author_profile_id = app_current_user_id());

-- ----- disputes -----------------------------------------------------------
DROP POLICY IF EXISTS disputes_select ON disputes;
CREATE POLICY disputes_select ON disputes FOR SELECT TO authenticated
  USING (raised_by = app_current_user_id()
         OR against_profile_id = app_current_user_id() OR is_admin());
DROP POLICY IF EXISTS disputes_insert ON disputes;
CREATE POLICY disputes_insert ON disputes FOR INSERT TO authenticated
  WITH CHECK (raised_by = app_current_user_id());
DROP POLICY IF EXISTS disputes_update ON disputes;
CREATE POLICY disputes_update ON disputes FOR UPDATE TO authenticated
  USING (raised_by = app_current_user_id() OR is_admin())
  WITH CHECK (raised_by = app_current_user_id() OR is_admin());

-- ----- verification_documents (sensitive PII: owner + admin only) ----------
DROP POLICY IF EXISTS verification_documents_select ON verification_documents;
CREATE POLICY verification_documents_select ON verification_documents FOR SELECT TO authenticated
  USING (profile_id = app_current_user_id() OR is_admin());
DROP POLICY IF EXISTS verification_documents_insert ON verification_documents;
CREATE POLICY verification_documents_insert ON verification_documents FOR INSERT TO authenticated
  WITH CHECK (profile_id = app_current_user_id());
-- Only admins/reviewers change status; owner cannot self-approve.
DROP POLICY IF EXISTS verification_documents_update_admin ON verification_documents;
CREATE POLICY verification_documents_update_admin ON verification_documents FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ----- notifications (private to recipient) -------------------------------
DROP POLICY IF EXISTS notifications_select_own ON notifications;
CREATE POLICY notifications_select_own ON notifications FOR SELECT TO authenticated
  USING (recipient_profile_id = app_current_user_id());
DROP POLICY IF EXISTS notifications_update_own ON notifications;
CREATE POLICY notifications_update_own ON notifications FOR UPDATE TO authenticated
  USING (recipient_profile_id = app_current_user_id())
  WITH CHECK (recipient_profile_id = app_current_user_id());
DROP POLICY IF EXISTS notifications_delete_own ON notifications;
CREATE POLICY notifications_delete_own ON notifications FOR DELETE TO authenticated
  USING (recipient_profile_id = app_current_user_id());
-- INSERT intentionally has no authenticated policy: notifications are emitted
-- by the backend (service_role), never by clients.

-- ----- audit_logs (admin read; writes are service_role only) --------------
DROP POLICY IF EXISTS audit_logs_select_admin ON audit_logs;
CREATE POLICY audit_logs_select_admin ON audit_logs FOR SELECT TO authenticated
  USING (is_admin());
-- No INSERT/UPDATE/DELETE policy for authenticated: the log is append-only and
-- written exclusively by the trusted backend.
