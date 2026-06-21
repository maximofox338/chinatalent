/**
 * Row Level Security (RLS) test suite — the platform's #1 security control.
 *
 * These tests do NOT trust that the policies in 015_rls_policies.sql are
 * correct; they prove it by impersonating real principals and asserting what
 * each one can and cannot see/do.
 *
 * How impersonation works:
 *   - We connect with the privileged migration role (DATABASE_URL).
 *   - For each "act as user X" block we open a transaction and:
 *       SET LOCAL app.current_user_id = '<uuid>'   (read by app_current_user_id())
 *       SET LOCAL ROLE authenticated                (so RLS actually applies)
 *     then ROLLBACK so assertions never mutate shared fixtures.
 *   - Fixtures are created up-front on the privileged (RLS-bypassing) connection.
 *
 * Requires a live database (DATABASE_URL) with migrations applied, plus
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to mint the auth.users rows that
 * profiles reference. If those are absent the whole suite is skipped with a
 * clear message rather than failing spuriously.
 *
 *   Run from apps/api:  npx vitest run src/db/__tests__/rls.test.ts
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool, type PoolClient } from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ENABLED = Boolean(databaseUrl && supabaseUrl && serviceRoleKey);
const isLocal = databaseUrl ? /@(localhost|127\.0\.0\.1)/.test(databaseUrl) : true;

// Unique tag so fixtures from a previous interrupted run never collide and are
// easy to identify. Kept deterministic-per-process (no Math.random needed).
const TAG = `rlstest_${process.pid}`;

interface Fixture {
  workerAId: string;
  workerBId: string;
  employerId: string;
  outsiderId: string;
  workerAProfileId: string; // worker_profiles.id
  companyId: string;
  openListingId: string;
  draftListingId: string;
  applicationId: string;
  conversationId: string;
  messageId: string;
  engagementId: string;
  invoiceId: string;
}

// describe.skip keeps the file green in environments without DB creds.
const suite = ENABLED ? describe : describe.skip;

suite('Row Level Security', () => {
  let pool: Pool;
  let supabase: SupabaseClient;
  const createdUserIds: string[] = [];
  let fx: Fixture;

  /** Run `fn` as an authenticated user, then roll back. */
  async function asUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // set_config(_, _, true) == SET LOCAL; parameterized => no injection.
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
      await client.query('SET LOCAL ROLE authenticated');
      return await fn(client);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  /** Run `fn` as the anonymous (logged-out) role, then roll back. */
  async function asAnon<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE anon');
      return await fn(client);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  async function mkUser(email: string): Promise<string> {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  beforeAll(async () => {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
    });
    supabase = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // --- Principals -------------------------------------------------------
    const workerAId = await mkUser(`${TAG}_workerA@example.com`);
    const workerBId = await mkUser(`${TAG}_workerB@example.com`);
    const employerId = await mkUser(`${TAG}_employer@example.com`);
    const outsiderId = await mkUser(`${TAG}_outsider@example.com`);

    // --- Fixtures, created on the privileged (RLS-bypassing) connection ----
    const db = await pool.connect();
    try {
      await db.query(
        `INSERT INTO profiles (id, role, display_name) VALUES
           ($1,'worker','Worker A'),($2,'worker','Worker B'),
           ($3,'employer','Employer'),($4,'worker','Outsider')`,
        [workerAId, workerBId, employerId, outsiderId],
      );

      const wa = await db.query<{ id: string }>(
        `INSERT INTO worker_profiles (profile_id, availability) VALUES ($1,'full_time') RETURNING id`,
        [workerAId],
      );
      const workerAProfileId = wa.rows[0].id;
      await db.query(
        `INSERT INTO worker_profiles (profile_id, availability) VALUES ($1,'full_time')`,
        [workerBId],
      );

      const company = await db.query<{ id: string }>(
        `INSERT INTO company_profiles (owner_profile_id, name, slug)
         VALUES ($1,'RLS Co',$2) RETURNING id`,
        [employerId, `${TAG}-co`],
      );
      const companyId = company.rows[0].id;
      await db.query(
        `INSERT INTO company_members (company_id, profile_id, role) VALUES ($1,$2,'owner')`,
        [companyId, employerId],
      );

      const openListing = await db.query<{ id: string }>(
        `INSERT INTO listings (company_id, posted_by, type, title, status)
         VALUES ($1,$2,'fulltime','Open Role','open') RETURNING id`,
        [companyId, employerId],
      );
      const openListingId = openListing.rows[0].id;
      const draftListing = await db.query<{ id: string }>(
        `INSERT INTO listings (company_id, posted_by, type, title, status)
         VALUES ($1,$2,'fulltime','Secret Draft','draft') RETURNING id`,
        [companyId, employerId],
      );
      const draftListingId = draftListing.rows[0].id;

      const application = await db.query<{ id: string }>(
        `INSERT INTO applications (listing_id, worker_profile_id, cover_letter)
         VALUES ($1,$2,'Please hire me') RETURNING id`,
        [openListingId, workerAProfileId],
      );
      const applicationId = application.rows[0].id;

      // Conversation between Worker A and Employer.
      const conv = await db.query<{ id: string }>(
        `INSERT INTO conversations (subject, created_by) VALUES ('Re: Open Role',$1) RETURNING id`,
        [employerId],
      );
      const conversationId = conv.rows[0].id;
      await db.query(
        `INSERT INTO conversation_participants (conversation_id, profile_id)
         VALUES ($1,$2),($1,$3)`,
        [conversationId, workerAId, employerId],
      );
      const msg = await db.query<{ id: string }>(
        `INSERT INTO messages (conversation_id, sender_id, body)
         VALUES ($1,$2,'Hello, are you available?') RETURNING id`,
        [conversationId, employerId],
      );
      const messageId = msg.rows[0].id;

      // Engagement + invoice (financial data).
      const eng = await db.query<{ id: string }>(
        `INSERT INTO engagements (company_id, worker_profile_id, type, compensation_amount)
         VALUES ($1,$2,'fulltime',120000) RETURNING id`,
        [companyId, workerAProfileId],
      );
      const engagementId = eng.rows[0].id;
      const inv = await db.query<{ id: string }>(
        `INSERT INTO invoices (engagement_id, company_id, invoice_number, type, amount)
         VALUES ($1,$2,$3,'placement_fee',12000) RETURNING id`,
        [engagementId, companyId, `${TAG}-INV-1`],
      );
      const invoiceId = inv.rows[0].id;

      fx = {
        workerAId,
        workerBId,
        employerId,
        outsiderId,
        workerAProfileId,
        companyId,
        openListingId,
        draftListingId,
        applicationId,
        conversationId,
        messageId,
        engagementId,
        invoiceId,
      };
    } finally {
      db.release();
    }
  }, 60_000);

  afterAll(async () => {
    // Deleting the auth users cascades to profiles and everything beneath them.
    for (const id of createdUserIds) {
      await supabase.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await pool?.end();
  });

  // ------------------------------------------------------------------ profiles
  describe('profiles', () => {
    it('a user CAN read their own profile', async () => {
      const r = await asUser(fx.workerAId, (c) =>
        c.query('SELECT id FROM profiles WHERE id = $1', [fx.workerAId]),
      );
      expect(r.rowCount).toBe(1);
    });

    it("a user CANNOT read another user's profile", async () => {
      const r = await asUser(fx.workerAId, (c) =>
        c.query('SELECT id FROM profiles WHERE id = $1', [fx.workerBId]),
      );
      expect(r.rowCount).toBe(0);
    });

    it("a user CANNOT update another user's profile", async () => {
      const r = await asUser(fx.workerAId, (c) =>
        c.query("UPDATE profiles SET display_name = 'hacked' WHERE id = $1", [fx.workerBId]),
      );
      expect(r.rowCount).toBe(0); // matched no rows under RLS
    });
  });

  // ------------------------------------------------------------------ listings
  describe('listings', () => {
    it('anyone (even anonymous) CAN read an open listing', async () => {
      const r = await asAnon((c) =>
        c.query('SELECT id FROM listings WHERE id = $1', [fx.openListingId]),
      );
      expect(r.rowCount).toBe(1);
    });

    it('a non-member CANNOT read a draft listing', async () => {
      const r = await asUser(fx.workerBId, (c) =>
        c.query('SELECT id FROM listings WHERE id = $1', [fx.draftListingId]),
      );
      expect(r.rowCount).toBe(0);
    });

    it('a company member CAN read their own draft listing', async () => {
      const r = await asUser(fx.employerId, (c) =>
        c.query('SELECT id FROM listings WHERE id = $1', [fx.draftListingId]),
      );
      expect(r.rowCount).toBe(1);
    });

    it('a non-owner CANNOT edit a listing', async () => {
      const r = await asUser(fx.workerBId, (c) =>
        c.query("UPDATE listings SET title = 'pwned' WHERE id = $1", [fx.openListingId]),
      );
      expect(r.rowCount).toBe(0);
    });

    it('the owning company CAN edit its listing', async () => {
      const r = await asUser(fx.employerId, (c) =>
        c.query("UPDATE listings SET title = 'Updated Role' WHERE id = $1", [fx.openListingId]),
      );
      expect(r.rowCount).toBe(1);
    });

    it('a non-member CANNOT insert a listing for a company they do not belong to', async () => {
      await expect(
        asUser(fx.workerBId, (c) =>
          c.query(
            `INSERT INTO listings (company_id, type, title, status)
             VALUES ($1,'fulltime','Injected','open')`,
            [fx.companyId],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  // -------------------------------------------------------------- applications
  describe('applications', () => {
    it('the applying worker CAN see their own application', async () => {
      const r = await asUser(fx.workerAId, (c) =>
        c.query('SELECT id FROM applications WHERE id = $1', [fx.applicationId]),
      );
      expect(r.rowCount).toBe(1);
    });

    it("another worker CANNOT see someone else's application", async () => {
      const r = await asUser(fx.workerBId, (c) =>
        c.query('SELECT id FROM applications WHERE id = $1', [fx.applicationId]),
      );
      expect(r.rowCount).toBe(0);
    });

    it('the hiring company CAN see applications to its listing', async () => {
      const r = await asUser(fx.employerId, (c) =>
        c.query('SELECT id FROM applications WHERE id = $1', [fx.applicationId]),
      );
      expect(r.rowCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------- messages
  describe('messages', () => {
    it('a conversation participant CAN read its messages', async () => {
      const r = await asUser(fx.workerAId, (c) =>
        c.query('SELECT id FROM messages WHERE id = $1', [fx.messageId]),
      );
      expect(r.rowCount).toBe(1);
    });

    it('a non-participant CANNOT read the messages', async () => {
      const r = await asUser(fx.workerBId, (c) =>
        c.query('SELECT id FROM messages WHERE id = $1', [fx.messageId]),
      );
      expect(r.rowCount).toBe(0);
    });

    it('a non-participant CANNOT post into the conversation', async () => {
      await expect(
        asUser(fx.workerBId, (c) =>
          c.query(
            `INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1,$2,'intrusion')`,
            [fx.conversationId, fx.workerBId],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  // -------------------------------------------------- engagements & financials
  describe('engagements and financial data', () => {
    it('the engaged worker CAN see their engagement', async () => {
      const r = await asUser(fx.workerAId, (c) =>
        c.query('SELECT id FROM engagements WHERE id = $1', [fx.engagementId]),
      );
      expect(r.rowCount).toBe(1);
    });

    it('the company CAN see its engagement', async () => {
      const r = await asUser(fx.employerId, (c) =>
        c.query('SELECT id FROM engagements WHERE id = $1', [fx.engagementId]),
      );
      expect(r.rowCount).toBe(1);
    });

    it('an uninvolved user CANNOT see the engagement', async () => {
      const r = await asUser(fx.outsiderId, (c) =>
        c.query('SELECT id FROM engagements WHERE id = $1', [fx.engagementId]),
      );
      expect(r.rowCount).toBe(0);
    });

    it('the company CAN see its invoice', async () => {
      const r = await asUser(fx.employerId, (c) =>
        c.query('SELECT id FROM invoices WHERE id = $1', [fx.invoiceId]),
      );
      expect(r.rowCount).toBe(1);
    });

    it('an uninvolved user CANNOT see the invoice', async () => {
      const r = await asUser(fx.outsiderId, (c) =>
        c.query('SELECT id FROM invoices WHERE id = $1', [fx.invoiceId]),
      );
      expect(r.rowCount).toBe(0);
    });

    it('a non-admin authenticated user CANNOT write invoices', async () => {
      await expect(
        asUser(fx.employerId, (c) =>
          c.query(
            `INSERT INTO invoices (company_id, invoice_number, type, amount)
             VALUES ($1,$2,'subscription',1)`,
            [fx.companyId, `${TAG}-INV-evil`],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});
