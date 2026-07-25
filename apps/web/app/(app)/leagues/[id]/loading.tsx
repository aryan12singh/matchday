import { Skeleton } from '../../../../components/ui/EmptyState';
import {
  HeaderSkeleton,
  ListSkeleton,
  PageSkeleton,
} from '../../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading league">
      <HeaderSkeleton />
      <Skeleton className="h-24 w-full" />
      <ListSkeleton rows={5} />
    </PageSkeleton>
  );
}
