import { useProfile } from '../hooks/useProfile';

/**
 * Landing screen after sign-in. Greets the user and shows role-specific
 * placeholder content. Real features (job browser, applications, team, etc.)
 * arrive in Phase 1.
 */
export default function Dashboard(): JSX.Element {
  const { profile } = useProfile();

  const name = profile?.fullName?.trim() || 'there';
  const isEmployer = profile?.role === 'employer';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Welcome, {name}!</h1>
      <p className="mt-1 text-sm text-slate-500">
        {isEmployer
          ? "Here's where you'll manage your hiring."
          : "Here's where you'll find work and track applications."}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(isEmployer ? EMPLOYER_CARDS : WORKER_CARDS).map((card) => (
          <PlaceholderCard key={card.title} title={card.title} description={card.description} />
        ))}
      </div>

      <p className="mt-8 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
        🚧 These features are coming soon. You're seeing an early preview of your dashboard.
      </p>
    </div>
  );
}

const WORKER_CARDS = [
  { title: 'Browse listings', description: 'Find full-time roles and freelance projects.' },
  { title: 'My applications', description: 'Track jobs and projects you’ve applied to.' },
  { title: 'My earnings', description: 'See payouts and payment history.' },
  { title: 'Profile', description: 'Keep your skills and details up to date.' },
];

const EMPLOYER_CARDS = [
  { title: 'Post a listing', description: 'Hire full-time or post a freelance project.' },
  { title: 'Applications', description: 'Review candidates who applied to your listings.' },
  { title: 'My team', description: 'Manage people you’ve hired.' },
  { title: 'Billing', description: 'View invoices and manage payment methods.' },
];

interface PlaceholderCardProps {
  title: string;
  description: string;
}

function PlaceholderCard({ title, description }: PlaceholderCardProps): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}
