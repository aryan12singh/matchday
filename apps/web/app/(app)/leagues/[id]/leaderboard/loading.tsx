import { Skeleton } from '../../../../../components/ui/EmptyState';
import {
  HeaderSkeleton,
  ListSkeleton,
  PageSkeleton,
} from '../../../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading leaderboard">
      <HeaderSkeleton />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-28 w-full" />
      <ListSkeleton rows={6} />
    </PageSkeleton>
  );
}
