import type { Metadata } from 'next';
import Link from 'next/link';

import { StateBadge } from '../../../components/match/StateBadge';
import { TeamChip } from '../../../components/match/TeamChip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { requireUser } from '../../../lib/auth';
import { getLiveCentre } from '../../../lib/live';

export const metadata: Metadata = { title: 'Live' };

/**
 * Live centre (T19). Everything in play, everything just finished, everything about to
 * start — the screen you leave open on a Saturday.
 */
export default async function LivePage() {
  await requireUser('/live');
  const { live, finished, upcoming } = await getLiveCentre();

  const nothing = live.length === 0 && finished.length === 0 && upcoming.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <p className="label">Live centre</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          {live.length > 0 ? `${live.length} in play` : "What's on"}
        </h1>
      </header>

      {nothing ? (
        <EmptyState
          title="Nothing on right now."
          body="Live matches appear here as they kick off, with your points updating as they go."
        />
      ) : null}

      {live.length > 0 ? (
        <Section title="In play">
          {live.map((fixture) => (
            <FixtureRow key={fixture.id} fixture={fixture} live />
          ))}
        </Section>
      ) : null}

      {upcoming.length > 0 ? (
        <Section title="Coming up">
          {upcoming.map((fixture) => (
            <FixtureRow key={fixture.id} fixture={fixture} />
          ))}
        </Section>
      ) : null}

      {finished.length > 0 ? (
        <Section title="Full time">
          {finished.map((fixture) => (
            <FixtureRow key={fixture.id} fixture={fixture} />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="label">{title}</h2>
      <ul className="flex flex-col divide-y divide-border">{children}</ul>
    </section>
  );
}

function FixtureRow({
  fixture,
  live = false,
}: {
  fixture: {
    id: string;
    status: string;
    minute: number | null;
    homeName: string;
    awayName: string;
    homeCode: string | null;
    awayCode: string | null;
    homeScore: number | null;
    awayScore: number | null;
    kickoffAt: string;
  };
  live?: boolean;
}) {
  return (
    <li>
      <Link
        href={`/live/${fixture.id}`}
        className={`flex min-h-tap items-center gap-3 py-3 ${live ? 'border-l-[3px] border-live pl-3' : 'pl-3'}`}
      >
        <TeamChip code={fixture.homeCode} name={fixture.homeName} size={24} />
        <span className="flex-1 truncate text-[14px]">
          {fixture.homeName} <span className="text-text-3">v</span> {fixture.awayName}
        </span>
        <TeamChip code={fixture.awayCode} name={fixture.awayName} size={24} />

        {fixture.homeScore != null ? (
          <span className="font-num text-[16px] font-bold tabular-nums">
            {fixture.homeScore}:{fixture.awayScore}
          </span>
        ) : (
          <span className="font-num text-[12px] tabular-nums text-text-3">
            {new Date(fixture.kickoffAt).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}

        {live ? (
          <StateBadge state="live">
            {fixture.minute != null ? `${fixture.minute}'` : 'Live'}
          </StateBadge>
        ) : null}
      </Link>
    </li>
  );
}
