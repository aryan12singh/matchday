import { Skeleton } from '../../../components/ui/EmptyState';
import {
  CardListSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from '../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading matchweek">
      <HeaderSkeleton />
      <Skeleton className="h-2 w-full" />
      <CardListSkeleton />
    </PageSkeleton>
  );
}
