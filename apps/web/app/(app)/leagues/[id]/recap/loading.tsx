import { Skeleton } from '../../../../../components/ui/EmptyState';
import {
  ListSkeleton,
  PageSkeleton,
} from '../../../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading recap">
      <Skeleton className="h-44 w-full" />
      <ListSkeleton rows={5} />
    </PageSkeleton>
  );
}
