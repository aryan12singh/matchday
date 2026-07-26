import 'server-only';

import { createClient } from './supabase/server';

/**
 * Competition standings (§4.2 screen 7).
 *
 * The real league table, which is a different thing from the season table *predictor* —
 * that now lives at /season-picks. This is also what the Table race scores against, so
 * until the bootstrap populates `standings` both surfaces read empty, and both say so
 * rather than showing zeros.
 */

export interface StandingRow {
  teamId: string;
  position: number;
  name: string;
  code: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string | null;
  /** The viewer's predicted position for this team, when they have entered a table. */
  predictedPosition: number | null;
}

export interface StandingsView {
  seasonLabel: string | null;
  competitionName: string | null;
  rows: StandingRow[];
  /** True once the viewer's season-table prediction is locked and comparable. */
  hasPrediction: boolean;
}

export async function getStandings(userId: string): Promise<StandingsView> {
  const supabase = await createClient();

  const { data: season } = await supabase
    .from('seasons')
    .select('id, label, competitions ( name )')
    .eq('is_current', true)
    .maybeSingle();

  if (!season) {
    return { seasonLabel: null, competitionName: null, rows: [], hasPrediction: false };
  }

  const [{ data: standings }, { data: prediction }] = await Promise.all([
    supabase
      .from('standings')
      .select('team_id, position, played, won, drawn, lost, goals_for, goals_against, points, form, teams ( name, code )')
      .eq('season_id', season.id)
      .order('position', { ascending: true }),
    supabase
      .from('predictions')
      .select('value, markets!inner ( season_id, market_types!inner ( code ) )')
      .eq('user_id', userId)
      .eq('markets.season_id', season.id)
      .eq('markets.market_types.code', 'season_table')
      .maybeSingle(),
  ]);

  // Position lookup from the user's predicted order, so the table can show their delta.
  const predictedOrder = ((prediction?.value as { order?: string[] } | null)?.order ?? []);
  const predictedPosition = new Map<string, number>();
  predictedOrder.forEach((teamId, index) => predictedPosition.set(teamId, index + 1));

  return {
    seasonLabel: season.label,
    competitionName: season.competitions?.name ?? null,
    hasPrediction: predictedOrder.length > 0,
    rows: (standings ?? []).map((row) => ({
      teamId: row.team_id,
      position: row.position,
      name: row.teams?.name ?? 'Unknown',
      code: row.teams?.code ?? null,
      played: row.played ?? 0,
      won: row.won ?? 0,
      drawn: row.drawn ?? 0,
      lost: row.lost ?? 0,
      goalsFor: row.goals_for ?? 0,
      goalsAgainst: row.goals_against ?? 0,
      goalDifference: (row.goals_for ?? 0) - (row.goals_against ?? 0),
      points: row.points ?? 0,
      form: row.form,
      predictedPosition: predictedPosition.get(row.team_id) ?? null,
    })),
  };
}
