import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { requireUser } from '../../../../../lib/auth';
import { getLeague } from '../../../../../lib/leagues';
import { getRules } from '../../../../../lib/rules';
import { createClient } from '../../../../../lib/supabase/server';

import { LeagueSettingsForm } from '../LeagueSettingsForm';
import { AdminPanels } from './AdminPanels';
import { MemberAdmin } from './MemberAdmin';

export const metadata: Metadata = { title: 'League admin' };

/**
 * League administration (§4.2 screen 17). Desktop-first, functional on mobile.
 *
 * "Configure once, touch rarely" — so the destructive and history-affecting controls are
 * grouped last and each states its consequence before you act, not after.
 */
export default async function LeagueAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/leagues/${id}/admin`);

  const league = await getLeague(id);
  if (!league) notFound();
  // Not a 403: a member who wanders here belongs on the league page, not an error.
  if (league.role !== 'organizer') redirect(`/leagues/${id}`);
  if (!league.leagueSeasonId) notFound();

  const supabase = await createClient();
  const [rules, { data: scheme }, { data: nextRound }] = await Promise.all([
    getRules(league.leagueSeasonId),
    league.prizeSchemeId
      ? supabase
          .from('prize_schemes')
          .select('currency_label, definition')
          .eq('id', league.prizeSchemeId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('rounds')
      .select('number')
      .neq('status', 'completed')
      .order('number', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const definition = (scheme?.definition ?? {}) as {
    per_round?: number[];
    overall?: number[];
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8">
      <Link
        href={`/leagues/${id}`}
        className="inline-flex min-h-tap items-center font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
      >
        ‹ {league.name}
      </Link>

      <header className="flex flex-col gap-1">
        <p className="label">Organizer</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">League admin</h1>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="label">Play settings</h2>
        <LeagueSettingsForm
          leagueSeasonId={league.leagueSeasonId}
          revealPolicy={league.revealPolicy}
          selectionMode={league.selectionMode}
        />
      </section>

      <AdminPanels
        leagueSeasonId={league.leagueSeasonId}
        weights={rules.weights}
        nextRound={nextRound?.number ?? 1}
        memberCount={league.memberCount}
        prizesActive={league.prizeSchemeId != null}
        currencyLabel={scheme?.currency_label ?? '£'}
        perRound={definition.per_round ?? []}
        overall={definition.overall ?? []}
      />

      <MemberAdmin
        leagueId={id}
        members={league.members}
        viewerId={user.id}
      />
    </div>
  );
}
