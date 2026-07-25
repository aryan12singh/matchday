import { Skeleton } from '../../../../components/ui/EmptyState';
import {
  HeaderSkeleton,
  PageSkeleton,
} from '../../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading">
      <HeaderSkeleton />
      <Skeleton className="h-40 w-full" />
    </PageSkeleton>
  );
}
