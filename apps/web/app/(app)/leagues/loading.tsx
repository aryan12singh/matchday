import {
  HeaderSkeleton,
  ListSkeleton,
  PageSkeleton,
} from '../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading leagues">
      <HeaderSkeleton />
      <ListSkeleton rows={4} />
    </PageSkeleton>
  );
}
