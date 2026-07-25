import type { ReactNode } from 'react';

/**
 * Empty and error states. Every data region in the product needs both
 * (CLAUDE.md working agreements), and they should look deliberate rather than like a
 * page that failed to load.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md bg-surface px-5 py-8 shadow-el-1">
      <p className="font-display text-[16px] font-bold">{title}</p>
      {body ? <p className="max-w-prose text-text-2">{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title, body }: { title: string; body?: string }) {
  return (
    <div
      role="alert"
      // A 3px left rail in the state colour, so the state is not carried by fill alone.
      className="flex flex-col gap-2 rounded-md border-l-[3px] border-danger bg-danger-dim px-5 py-4"
    >
      <p className="font-display text-[14px] font-bold text-danger">{title}</p>
      {body ? <p className="text-[13px] text-text-2">{body}</p> : null}
    </div>
  );
}

/** Shimmer placeholder. Static under prefers-reduced-motion, via globals.css. */
export function Skeleton({ className = 'h-5 w-full' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton rounded-sm ${className}`}
    />
  );
}
