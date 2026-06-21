import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, UserRole } from '@chinatalent/shared';
import { api } from '../lib/api';
import { useProfile } from '../hooks/useProfile';
import { Spinner } from '../components/Spinner';

// A small, sensible default list. The full list can come from the backend later.
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'es', label: 'Español' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
];

const COUNTRIES = [
  { code: 'CN', label: 'China' },
  { code: 'IN', label: 'India' },
  { code: 'PH', label: 'Philippines' },
  { code: 'VN', label: 'Vietnam' },
  { code: 'ID', label: 'Indonesia' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
];

type RegisterPayload = {
  role: UserRole;
  full_name: string;
  country_code: string;
  preferred_language: string;
};

/**
 * Shown after a user's first sign-in when they have no profile yet. Captures
 * their role and basic details, creates the profile, then sends them to the
 * dashboard.
 */
export default function Register(): JSX.Element {
  const navigate = useNavigate();
  const { refresh } = useProfile();

  const [role, setRole] = useState<UserRole | null>(null);
  const [fullName, setFullName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [language, setLanguage] = useState('en');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = role !== null && fullName.trim() !== '' && countryCode !== '';

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!canSubmit || role === null) return;

    setError(null);
    setSubmitting(true);
    try {
      const payload: RegisterPayload = {
        role,
        full_name: fullName.trim(),
        country_code: countryCode,
        preferred_language: language,
      };
      await api.post<User>('/api/auth/register', payload);
      // Make the new profile available app-wide before navigating.
      await refresh();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete registration');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Welcome — let's set up your profile</h1>
          <p className="mt-2 text-sm text-slate-500">Tell us a bit about you to get started.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
        >
          {/* Role selection */}
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">I'm here to…</legend>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RoleOption
                selected={role === 'worker'}
                onSelect={() => setRole('worker')}
                title="Find work"
                subtitle="I'm looking for jobs or projects"
              />
              <RoleOption
                selected={role === 'employer'}
                onSelect={() => setRole('employer')}
                title="Hire talent"
                subtitle="I'm hiring for my company"
              />
            </div>
          </fieldset>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-slate-700">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="country" className="block text-sm font-medium text-slate-700">
                Country
              </label>
              <select
                id="country"
                required
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="" disabled>
                  Select…
                </option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="language" className="block text-sm font-medium text-slate-700">
                Preferred language
              </label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Spinner className="h-4 w-4" label="Saving" />}
            {submitting ? 'Creating your profile…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

interface RoleOptionProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
}

function RoleOption({ selected, onSelect, title, subtitle }: RoleOptionProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
        selected
          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
          : 'border-slate-300 bg-white hover:border-slate-400'
      }`}
    >
      <span className="block text-sm font-semibold text-slate-900">{title}</span>
      <span className="mt-1 block text-xs text-slate-500">{subtitle}</span>
    </button>
  );
}
