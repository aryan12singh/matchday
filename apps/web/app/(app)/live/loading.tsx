import {
  HeaderSkeleton,
  ListSkeleton,
  PageSkeleton,
} from '../_skeletons';

export default function Loading() {
  return (
    <PageSkeleton label="Loading live centre">
      <HeaderSkeleton />
      <ListSkeleton rows={5} />
    </PageSkeleton>
  );
}
