import { Skeleton } from '../../../components/ui/EmptyState';

/**
 * Route-level loading shapes.
 *
 * Each one mirrors the layout it stands in for, so the page does not jump when the real
 * content arrives. A generic spinner would be less work and worse: it tells the user
 * something is happening but not what is about to appear.
 *
 * Marked aria-busy with a label, so a screen reader announces "loading" once rather than
 * reading out a wall of empty boxes.
 */
export function PageSkeleton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8"
    >
      {children}
    </div>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-56" />
    </div>
  );
}

export function ListSkeleton({ rows = 5, height = 'h-14' }: { rows?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`${height} w-full`} />
      ))}
    </div>
  );
}

export function CardListSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}
