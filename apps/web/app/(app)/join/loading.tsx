import { Skeleton } from '../../../components/ui/EmptyState';
import {
  HeaderSkeleton,
  PageSkeleton,
} from '../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading">
      <HeaderSkeleton />
      <Skeleton className="h-24 w-full" />
    </PageSkeleton>
  );
}
