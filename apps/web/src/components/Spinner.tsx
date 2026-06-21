interface SpinnerProps {
  /** Tailwind size classes, e.g. 'h-5 w-5'. Defaults to a medium spinner. */
  className?: string;
  /** Accessible label announced to screen readers. */
  label?: string;
}

/** Minimal, dependency-free loading spinner. */
export function Spinner({ className = 'h-5 w-5', label = 'Loading' }: SpinnerProps): JSX.Element {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
