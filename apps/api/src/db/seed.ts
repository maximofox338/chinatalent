/**
 * Development seed data for China Talent Bridge.
 *
 *   Run from apps/api:  npx ts-node src/db/seed.ts
 *
 * Inserts: 5 categories, ~20 skills, 2 auth users (1 worker, 1 employer),
 * 1 company, and 2 listings (1 freelance, 1 full-time).
 *
 * Idempotent: uses fixed UUIDs + ON CONFLICT so re-running updates in place.
 *
 * Requires (in apps/api/.env): DATABASE_URL, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY. Auth users are created through the Supabase Admin
 * API (so the auth.users <- profiles foreign key is satisfied); everything else
 * is written over a direct Postgres connection.
 *
 * Connects as the privileged role (bypasses RLS), so seeding is unrestricted.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!databaseUrl) fail('DATABASE_URL is not set in apps/api/.env');
if (!supabaseUrl) fail('SUPABASE_URL is not set in apps/api/.env');
if (!serviceRoleKey) fail('SUPABASE_SERVICE_ROLE_KEY is not set in apps/api/.env');

const isLocal = /@(localhost|127\.0\.0\.1)/.test(databaseUrl);
const ssl = isLocal ? false : { rejectUnauthorized: false };

// --- Fixed identifiers so the seed is fully idempotent --------------------
const WORKER_EMAIL = 'worker@chinatalent.dev';
const EMPLOYER_EMAIL = 'employer@chinatalent.dev';
const SEED_PASSWORD = 'Password123!';

const ID = {
  company: '00000000-0000-0000-0000-0000000000c0',
  workerProfile: '00000000-0000-0000-0000-0000000000a0',
  listingFreelance: '00000000-0000-0000-0000-0000000000f1',
  listingFulltime: '00000000-0000-0000-0000-0000000000f2',
} as const;

const CATEGORIES = [
  { slug: 'software-engineering', name: 'Software Engineering' },
  { slug: 'design', name: 'Design' },
  { slug: 'marketing', name: 'Marketing' },
  { slug: 'data-science', name: 'Data Science' },
  { slug: 'product', name: 'Product' },
];

// Skill -> owning category slug.
const SKILLS: Array<{ slug: string; name: string; category: string }> = [
  { slug: 'typescript', name: 'TypeScript', category: 'software-engineering' },
  { slug: 'javascript', name: 'JavaScript', category: 'software-engineering' },
  { slug: 'react', name: 'React', category: 'software-engineering' },
  { slug: 'nodejs', name: 'Node.js', category: 'software-engineering' },
  { slug: 'python', name: 'Python', category: 'software-engineering' },
  { slug: 'go', name: 'Go', category: 'software-engineering' },
  { slug: 'java', name: 'Java', category: 'software-engineering' },
  { slug: 'sql', name: 'SQL', category: 'software-engineering' },
  { slug: 'postgresql', name: 'PostgreSQL', category: 'software-engineering' },
  { slug: 'figma', name: 'Figma', category: 'design' },
  { slug: 'ui-design', name: 'UI Design', category: 'design' },
  { slug: 'ux-research', name: 'UX Research', category: 'design' },
  { slug: 'seo', name: 'SEO', category: 'marketing' },
  { slug: 'content-marketing', name: 'Content Marketing', category: 'marketing' },
  { slug: 'google-ads', name: 'Google Ads', category: 'marketing' },
  { slug: 'machine-learning', name: 'Machine Learning', category: 'data-science' },
  { slug: 'data-analysis', name: 'Data Analysis', category: 'data-science' },
  { slug: 'pandas', name: 'pandas', category: 'data-science' },
  { slug: 'product-management', name: 'Product Management', category: 'product' },
  { slug: 'agile', name: 'Agile', category: 'product' },
];

/**
 * Creates a Supabase auth user (or returns the existing one's id). The Admin
 * API has no "get by email", so on the "already registered" path we page
 * through listUsers to recover the id.
 */
async function ensureAuthUser(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data.user) return data.user.id;

  // Already exists -> find it.
  for (let page = 1; page <= 20; page++) {
    const list = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (list.error) fail(`listUsers failed: ${list.error.message}`);
    const found = list.data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (list.data.users.length < 200) break;
  }
  return fail(`Could not create or find auth user ${email}: ${error?.message ?? 'unknown'}`);
}

async function main(): Promise<void> {
  const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('Creating auth users…');
  const workerId = await ensureAuthUser(supabase, WORKER_EMAIL, SEED_PASSWORD);
  const employerId = await ensureAuthUser(supabase, EMPLOYER_EMAIL, SEED_PASSWORD);
  console.log(`  worker:   ${WORKER_EMAIL}`);
  console.log(`  employer: ${EMPLOYER_EMAIL}`);

  const client = new Client({ connectionString: databaseUrl, ssl });
  await client.connect();
  try {
    await client.query('BEGIN');

    // Profiles
    await client.query(
      `INSERT INTO profiles (id, role, display_name, full_name, country, preferred_language)
       VALUES ($1,'worker','Test Worker','Wei Chen','CN','zh'),
              ($2,'employer','Test Employer','Dana Ops','US','en')
       ON CONFLICT (id) DO UPDATE
         SET role = EXCLUDED.role, display_name = EXCLUDED.display_name`,
      [workerId, employerId],
    );

    // Categories
    for (const [i, c] of CATEGORIES.entries()) {
      await client.query(
        `INSERT INTO categories (slug, name, sort_order) VALUES ($1,$2,$3)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`,
        [c.slug, c.name, i],
      );
    }

    // Skills (resolve category_id by slug)
    for (const s of SKILLS) {
      await client.query(
        `INSERT INTO skills (slug, name, category_id)
         VALUES ($1,$2,(SELECT id FROM categories WHERE slug = $3))
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, category_id = EXCLUDED.category_id`,
        [s.slug, s.name, s.category],
      );
    }

    // Worker profile
    await client.query(
      `INSERT INTO worker_profiles
         (id, profile_id, headline, summary, years_experience, hourly_rate_usd,
          availability, english_level, chinese_level, is_verified)
       VALUES ($1,$2,'Full-stack engineer','React + Node specialist',6,55.00,
               'full_time','professional','native',true)
       ON CONFLICT (id) DO UPDATE SET headline = EXCLUDED.headline`,
      [ID.workerProfile, workerId],
    );

    // A couple of worker skills
    await client.query(
      `INSERT INTO worker_skills (worker_profile_id, skill_id, proficiency, years)
       SELECT $1, s.id, 'expert', 5 FROM skills s WHERE s.slug IN ('typescript','react','nodejs')
       ON CONFLICT DO NOTHING`,
      [ID.workerProfile],
    );

    // Company + membership
    await client.query(
      `INSERT INTO company_profiles
         (id, owner_profile_id, name, slug, website, industry, size,
          headquarters_country, is_verified)
       VALUES ($1,$2,'Acme Remote','acme-remote','https://acme.example',
               'Software','11-50','US',true)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [ID.company, employerId],
    );
    await client.query(
      `INSERT INTO company_members (company_id, profile_id, role)
       VALUES ($1,$2,'owner') ON CONFLICT (company_id, profile_id) DO NOTHING`,
      [ID.company, employerId],
    );

    // Freelance listing + details
    await client.query(
      `INSERT INTO listings
         (id, company_id, posted_by, type, title, description, category_id, status,
          location_type, published_at)
       VALUES ($1,$2,$3,'freelance','Build a React analytics dashboard',
               'Short-term freelance build of an analytics dashboard.',
               (SELECT id FROM categories WHERE slug='software-engineering'),
               'open','remote', now())
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status`,
      [ID.listingFreelance, ID.company, employerId],
    );
    await client.query(
      `INSERT INTO freelance_details
         (listing_id, budget_type, budget_min, budget_max, estimated_hours, estimated_duration_weeks)
       VALUES ($1,'fixed',3000,6000,120,6)
       ON CONFLICT (listing_id) DO UPDATE SET budget_max = EXCLUDED.budget_max`,
      [ID.listingFreelance],
    );

    // Full-time listing + details
    await client.query(
      `INSERT INTO listings
         (id, company_id, posted_by, type, title, description, category_id, status,
          location_type, published_at)
       VALUES ($1,$2,$3,'fulltime','Senior Node.js Engineer',
               'Full-time remote role building our core API platform.',
               (SELECT id FROM categories WHERE slug='software-engineering'),
               'open','remote', now())
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status`,
      [ID.listingFulltime, ID.company, employerId],
    );
    await client.query(
      `INSERT INTO fulltime_details
         (listing_id, employment_type, salary_min, salary_max, salary_period, seniority)
       VALUES ($1,'full_time',90000,130000,'year','senior')
       ON CONFLICT (listing_id) DO UPDATE SET salary_max = EXCLUDED.salary_max`,
      [ID.listingFulltime],
    );

    // Required skills on the listings
    await client.query(
      `INSERT INTO listing_skills (listing_id, skill_id, is_required)
       SELECT $1, id, true FROM skills WHERE slug IN ('react','typescript')
       ON CONFLICT DO NOTHING`,
      [ID.listingFreelance],
    );
    await client.query(
      `INSERT INTO listing_skills (listing_id, skill_id, is_required)
       SELECT $1, id, true FROM skills WHERE slug IN ('nodejs','postgresql')
       ON CONFLICT DO NOTHING`,
      [ID.listingFulltime],
    );

    await client.query('COMMIT');
    console.log('✅ Seed complete: 5 categories, 20 skills, 2 users, 1 company, 2 listings.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    fail(`Seed failed: ${message}`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  fail(`Unexpected error: ${message}`);
});
