import { Skeleton } from '../../../components/ui/EmptyState';
import {
  HeaderSkeleton,
  ListSkeleton,
  PageSkeleton,
} from '../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading season table">
      <HeaderSkeleton />
      <Skeleton className="h-14 w-full" />
      <ListSkeleton rows={8} height="h-11" />
    </PageSkeleton>
  );
}
