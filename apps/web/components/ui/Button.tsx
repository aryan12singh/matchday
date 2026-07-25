import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Button — recreated from design/components/Button.{d.ts,prompt.md,jsx}.
 *
 * Primary is volt: the user's action, one per view, uppercase copy. Volt is never
 * decoration and never marks match state — that is coral's job.
 */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  children: ReactNode;
  full?: boolean;
  /** Renders a spinner and blocks input without changing the button's width. */
  loading?: boolean;
}

const VARIANTS = {
  primary: 'bg-accent text-on-accent hover:opacity-90',
  secondary: 'bg-surface-2 text-text shadow-el-1 hover:bg-surface-3',
  ghost: 'bg-transparent text-text-2 hover:text-text hover:bg-surface-2',
  danger: 'bg-danger text-on-live hover:opacity-90',
} as const;

export function Button({
  variant = 'primary',
  children,
  full = false,
  loading = false,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        // min-h-tap is the 44px floor from the design tokens, not a magic number.
        'inline-flex min-h-tap items-center justify-center gap-2 rounded-md px-5',
        'font-display text-[13px] font-extrabold uppercase tracking-label',
        'transition-opacity disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        full ? 'w-full' : '',
      ].join(' ')}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      // Reduced motion turns the spin off globally (globals.css); the ring stays visible
      // so the busy state is never conveyed by movement alone.
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}
