import { Skeleton } from '../../../../components/ui/EmptyState';
import {
  ListSkeleton,
  PageSkeleton,
} from '../../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading match">
      <Skeleton className="h-40 w-full" />
      <ListSkeleton rows={6} />
    </PageSkeleton>
  );
}
