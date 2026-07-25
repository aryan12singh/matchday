import { Skeleton } from '../../../../../components/ui/EmptyState';
import {
  HeaderSkeleton,
  ListSkeleton,
  PageSkeleton,
} from '../../../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading fixture selection">
      <HeaderSkeleton />
      <Skeleton className="h-14 w-full" />
      <ListSkeleton rows={6} height="h-20" />
    </PageSkeleton>
  );
}
