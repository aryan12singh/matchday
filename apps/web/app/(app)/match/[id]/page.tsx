import { redirect } from 'next/navigation';

/**
 * `/match/[id]` is the path the IA specifies (§4.1); the implementation lives at
 * `/live/[id]`, which grew from the live centre and now covers every phase.
 *
 * A redirect rather than a duplicate: two routes rendering the same screen is two places
 * to fix a bug. Links shared in group chats use whichever path they were given and both
 * work.
 */
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/live/${id}`);
}
