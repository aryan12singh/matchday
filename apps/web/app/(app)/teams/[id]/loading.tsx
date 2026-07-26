import { Skeleton } from '../../../../components/ui/EmptyState';
import { HeaderSkeleton, ListSkeleton, PageSkeleton } from '../../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading team">
      <HeaderSkeleton />
      <Skeleton className="h-10 w-48" />
      <ListSkeleton rows={8} />
    </PageSkeleton>
  );
}
