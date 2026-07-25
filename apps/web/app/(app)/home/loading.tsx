import { Skeleton } from '../../../components/ui/EmptyState';
import {
  ListSkeleton,
  PageSkeleton,
} from '../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading home">
      <Skeleton className="h-44 w-full" />
      <ListSkeleton rows={3} />
    </PageSkeleton>
  );
}
