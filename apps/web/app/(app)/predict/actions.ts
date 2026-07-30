'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '../../../lib/supabase/server';

/**
 * Autosave for a fixture card. There is no save button by design
 * (design/README.md §2: "Saved automatically · editable until each kickoff"), so this is
 * called on every change with the whole card.
 *
 * It returns a result rather than throwing, because the one failure that matters —
 * writing after kickoff — is an ordinary outcome the UI must render inline as the
 * save-conflict state, not an exception.
 */

const payload = z.object({
  fixtureId: z.string().uuid(),
  home: z.number().int().min(0).max(99),
  away: z.number().int().min(0).max(99),
  goalDiff: z.number().int().min(-99).max(99).nullable(),
  totalGoals: z.number().int().min(0).max(99).nullable(),
  btts: z.boolean().nullable(),
  firstTeamId: z.string().uuid().nullable(),
  firstTeamNone: z.boolean(),
  firstScorerId: z.string().uuid().nullable(),
  firstScorerNone: z.boolean(),
});

export type SavePredictionInput = z.infer<typeof payload>;

export type SaveResult =
  | { status: 'saved'; at: string }
  | { status: 'locked'; message: string }
  | { status: 'error'; message: string };

export async function savePrediction(input: SavePredictionInput): Promise<SaveResult> {
  const parsed = payload.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid prediction.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('save_fixture_prediction', {
    p_fixture_id: parsed.data.fixtureId,
    p_home: parsed.data.home,
    p_away: parsed.data.away,
    p_goal_diff: parsed.data.goalDiff ?? undefined,
    p_total_goals: parsed.data.totalGoals ?? undefined,
    p_btts: parsed.data.btts ?? undefined,
    p_first_team_id: parsed.data.firstTeamId ?? undefined,
    p_first_team_none: parsed.data.firstTeamNone,
    p_first_scorer_id: parsed.data.firstScorerId ?? undefined,
    p_first_scorer_none: parsed.data.firstScorerNone,
  });

  if (error) {
    // 23514 is what enforce_prediction_lock raises. The design calls for a specific
    // inline banner here — "Locked at kickoff — not saved", earlier pick stands — rather
    // than a generic failure, because the user needs to know their previous answer
    // survived.
    if (error.code === '23514' && /locked/i.test(error.message)) {
      return { status: 'locked', message: 'Locked at kickoff — not saved. Your earlier pick stands.' };
    }
    return { status: 'error', message: 'Could not save. We will retry.' };
  }

  // Deliberately NOT revalidatePath('/predict').
  //
  // Autosave fires on every change, and revalidating pushes a fresh RSC payload that
  // replaces the board mid-edit — discarding the optimistic value the user is still
  // looking at. The symptom was a first-scorer pick that persisted to the database and
  // then vanished from the screen a moment later, which reads as "it didn't save".
  //
  // The client is already the authority on unsaved edits and rolls back explicitly when
  // the server rejects one, so there is nothing here for a refetch to fix.
  return { status: 'saved', at: new Date().toISOString() };
}

export async function saveSeasonTable(seasonId: string, order: string[]): Promise<SaveResult> {
  if (order.length !== 20 || new Set(order).size !== 20) {
    return { status: 'error', message: 'Rank all 20 teams exactly once.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('save_season_table_prediction', {
    p_season_id: seasonId,
    p_order: order,
  });

  if (error) {
    if (error.code === '23514' && /locked/i.test(error.message)) {
      return {
        status: 'locked',
        message: 'The season has started — the table locked at the first kickoff.',
      };
    }
    return { status: 'error', message: 'Could not save your table.' };
  }

  revalidatePath('/table');
  return { status: 'saved', at: new Date().toISOString() };
}

export async function saveGoldenBoot(seasonId: string, playerId: string): Promise<SaveResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_golden_boot_prediction', {
    p_season_id: seasonId,
    p_player_id: playerId,
  });

  if (error) {
    if (error.code === '23514' && /locked/i.test(error.message)) {
      return { status: 'locked', message: 'The season has started — Golden Boot is locked.' };
    }
    return { status: 'error', message: 'Could not save your pick.' };
  }

  revalidatePath('/table');
  return { status: 'saved', at: new Date().toISOString() };
}

/**
 * The two squads for one fixture, for the first-scorer picker.
 *
 * Loaded on demand rather than embedded in the board: a matchweek is ten fixtures, so
 * shipping every squad up front would put ~560 players on the wire to populate a control
 * most people open for a handful of matches. Fetching per fixture is ~56 players, and the
 * client caches what it has already asked for.
 *
 * Ordered by position then name so the list reads like a team sheet — goalkeepers first —
 * rather than in whatever order the rows came back.
 */
export interface SquadPlayer {
  id: string;
  name: string;
  knownAs: string;
  position: string | null;
  shirtNumber: number | null;
  teamId: string;
}

const POSITION_ORDER: Record<string, number> = {
  Goalkeeper: 0,
  Defender: 1,
  Midfielder: 2,
  Forward: 3,
};

export async function loadFixtureSquads(
  fixtureId: string,
): Promise<{ home: SquadPlayer[]; away: SquadPlayer[] } | { error: string }> {
  if (!z.string().uuid().safeParse(fixtureId).success) return { error: 'Unknown fixture.' };

  const supabase = await createClient();

  const { data: fixture } = await supabase
    .from('fixtures')
    .select('home_team_id, away_team_id, rounds!fixtures_round_id_fkey ( stages ( season_id ) )')
    .eq('id', fixtureId)
    .maybeSingle();

  if (!fixture) return { error: 'Unknown fixture.' };

  const seasonId = (
    fixture.rounds as unknown as { stages: { season_id: string } | null } | null
  )?.stages?.season_id;
  if (!seasonId) return { error: 'That fixture has no season.' };

  const { data, error } = await supabase
    .from('squad_memberships')
    .select('team_id, shirt_number, position, players ( id, full_name, known_as )')
    .eq('season_id', seasonId)
    .in('team_id', [fixture.home_team_id, fixture.away_team_id]);

  if (error) return { error: 'Could not load the squads.' };

  const players: SquadPlayer[] = (data ?? [])
    .filter((row) => row.players != null)
    .map((row) => {
      const player = row.players as unknown as {
        id: string;
        full_name: string;
        known_as: string | null;
      };
      return {
        id: player.id,
        name: player.full_name,
        knownAs: player.known_as ?? player.full_name,
        position: row.position,
        shirtNumber: row.shirt_number,
        teamId: row.team_id,
      };
    })
    .sort(
      (a, b) =>
        (POSITION_ORDER[a.position ?? ''] ?? 9) - (POSITION_ORDER[b.position ?? ''] ?? 9) ||
        a.knownAs.localeCompare(b.knownAs),
    );

  return {
    home: players.filter((p) => p.teamId === fixture.home_team_id),
    away: players.filter((p) => p.teamId === fixture.away_team_id),
  };
}
