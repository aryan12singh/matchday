import type { Database } from '@matchday/domain';
import type { ProviderFixture } from '@matchday/provider';
import type { SupabaseClient } from '@supabase/supabase-js';

import { type ClubCandidate, matchClub } from './club-names';
import { mapEntity, resolveEntity } from './entity-map';

type Db = SupabaseClient<Database>;

/**
 * Linking a second provider's fixtures to a season loaded from a first.
 *
 * The schedule comes from the Premier League's own JSON and live results come from
 * API-Football. Neither knows the other's ids, so after a bootstrap the live sync looks up
 * every incoming fixture under `api-football`, finds nothing, and reports it as unmatched —
 * correct behaviour, and completely useless. This is what teaches it the mapping.
 *
 * The link is established from facts that survive across providers: which two clubs are
 * playing, and roughly when. Within one season an ordered pairing occurs exactly once, so
 * (home club, away club) identifies a fixture on its own; the kickoff is a corroborating
 * check rather than the key, because a rearranged fixture keeps its identity while moving
 * by weeks.
 *
 * Everything here refuses rather than guesses. A fixture linked to the wrong match writes
 * real results against other people's predictions, and unlike a missing link — which shows
 * up in the unmatched count — a wrong one looks exactly like success.
 */

export interface ReconcileResult {
  seen: number;
  alreadyMapped: number;
  linked: number;
  unmatchedClub: number;
  unmatchedFixture: number;
  rejectedKickoff: number;
}

/** How far a fixture may have moved and still be considered the same match. */
const KICKOFF_TOLERANCE_DAYS = 14;

export async function reconcileFixtures(
  client: Db,
  provider: string,
  seasonId: string,
  fixtures: readonly ProviderFixture[],
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    seen: 0,
    alreadyMapped: 0,
    linked: 0,
    unmatchedClub: 0,
    unmatchedFixture: 0,
    rejectedKickoff: 0,
  };

  if (fixtures.length === 0) return result;

  const { data: teams } = await client
    .from('teams')
    .select('id, name, team_season_entries!inner ( season_id )')
    .eq('team_season_entries.season_id', seasonId);

  const candidates: ClubCandidate[] = (teams ?? []).map((t) => ({ id: t.id, name: t.name }));
  if (candidates.length === 0) return result;

  for (const incoming of fixtures) {
    result.seen += 1;

    const existing = await resolveEntity(client, provider, 'fixture', incoming.providerId);
    if (existing) {
      result.alreadyMapped += 1;
      continue;
    }

    if (!incoming.homeTeamName || !incoming.awayTeamName) {
      result.unmatchedClub += 1;
      continue;
    }

    const home = matchClub(incoming.homeTeamName, candidates);
    const away = matchClub(incoming.awayTeamName, candidates);

    // Both clubs must resolve. One confident match and one guess is still a guess, and
    // the pairing is the key — half of it identifies nothing.
    if (!home || !away || home.id === away.id) {
      result.unmatchedClub += 1;
      continue;
    }

    // The FK is named explicitly because league_round_selections also references both
    // fixtures and rounds, which gives PostgREST two paths between them and makes a bare
    // `rounds!inner` embed ambiguous — it errors rather than picking one.
    const { data: candidateFixtures } = await client
      .from('fixtures')
      .select('id, kickoff_at, rounds!fixtures_round_id_fkey!inner ( stages!inner ( season_id ) )')
      .eq('rounds.stages.season_id', seasonId)
      .eq('home_team_id', home.id)
      .eq('away_team_id', away.id);

    // Exactly one, or nothing. Two would mean the pairing is not unique in this season,
    // which breaks the assumption this whole match is built on.
    if (!candidateFixtures || candidateFixtures.length !== 1) {
      result.unmatchedFixture += 1;
      continue;
    }

    const internal = candidateFixtures[0]!;
    const drift = Math.abs(
      new Date(internal.kickoff_at).getTime() - new Date(incoming.kickoffAt).getTime(),
    );

    if (drift > KICKOFF_TOLERANCE_DAYS * 24 * 3600 * 1000) {
      // The clubs match but the date is months out — far more likely a different season's
      // meeting than a reschedule, so this is refused and counted.
      result.rejectedKickoff += 1;
      continue;
    }

    await mapEntity(client, provider, 'fixture', incoming.providerId, internal.id);

    // Map the clubs too. Event ingestion resolves teams by provider id, and doing it here
    // means the name matching runs once per club per season rather than per event.
    await mapEntity(client, provider, 'team', incoming.homeTeamProviderId, home.id);
    await mapEntity(client, provider, 'team', incoming.awayTeamProviderId, away.id);

    result.linked += 1;
  }

  return result;
}

/**
 * The current season's id, or null. Small helper so the sync jobs do not each repeat it.
 */
export async function currentSeasonId(client: Db): Promise<string | null> {
  const { data } = await client.from('seasons').select('id').eq('is_current', true).maybeSingle();
  return data?.id ?? null;
}
