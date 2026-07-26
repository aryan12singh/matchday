import 'server-only';

import { createClient } from './supabase/server';

/**
 * Teams and players (§4.2 screen 15) — the reference layer behind pick decisions.
 *
 * Squads come from squad_memberships, which the bootstrap populates. Until the provider
 * key exists these read empty, so every surface here has an explicit "not imported yet"
 * state rather than an empty list that reads as a bug.
 */

export interface TeamSummary {
  id: string;
  name: string;
  shortName: string | null;
  code: string | null;
  position: number | null;
  played: number | null;
  points: number | null;
  squadSize: number;
}

export async function getTeams(): Promise<{ teams: TeamSummary[]; seasonLabel: string | null }> {
  const supabase = await createClient();

  const { data: season } = await supabase
    .from('seasons')
    .select('id, label')
    .eq('is_current', true)
    .maybeSingle();

  if (!season) return { teams: [], seasonLabel: null };

  const [{ data: entries }, { data: standings }, { data: squads }] = await Promise.all([
    supabase
      .from('team_season_entries')
      .select('team_id, teams ( id, name, short_name, code )')
      .eq('season_id', season.id),
    supabase.from('standings').select('team_id, position, played, points').eq('season_id', season.id),
    supabase.from('squad_memberships').select('team_id').eq('season_id', season.id),
  ]);

  const byTeam = new Map((standings ?? []).map((row) => [row.team_id, row]));
  const squadSize = new Map<string, number>();
  for (const row of squads ?? []) {
    squadSize.set(row.team_id, (squadSize.get(row.team_id) ?? 0) + 1);
  }

  return {
    seasonLabel: season.label,
    teams: (entries ?? [])
      .map((entry) => {
        const table = byTeam.get(entry.team_id);
        return {
          id: entry.team_id,
          name: entry.teams?.name ?? 'Unknown',
          shortName: entry.teams?.short_name ?? null,
          code: entry.teams?.code ?? null,
          position: table?.position ?? null,
          played: table?.played ?? null,
          points: table?.points ?? null,
          squadSize: squadSize.get(entry.team_id) ?? 0,
        };
      })
      // By table position when it exists, alphabetically before a ball is kicked.
      .sort((a, b) =>
        a.position != null && b.position != null
          ? a.position - b.position
          : a.name.localeCompare(b.name),
      ),
  };
}

export interface TeamDetail {
  id: string;
  name: string;
  code: string | null;
  position: number | null;
  points: number | null;
  form: string | null;
  squad: Array<{
    playerId: string;
    name: string;
    position: string | null;
    shirtNumber: number | null;
    goals: number;
    assists: number;
  }>;
  fixtures: Array<{
    id: string;
    kickoffAt: string;
    status: string;
    opponent: string;
    opponentCode: string | null;
    home: boolean;
    homeScore: number | null;
    awayScore: number | null;
  }>;
}

export async function getTeam(teamId: string): Promise<TeamDetail | null> {
  const supabase = await createClient();

  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, code')
    .eq('id', teamId)
    .maybeSingle();

  if (!team) return null;

  const [{ data: standing }, { data: squad }, { data: stats }, { data: fixtures }] =
    await Promise.all([
      season
        ? supabase
            .from('standings')
            .select('position, points, form')
            .eq('season_id', season.id)
            .eq('team_id', teamId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      season
        ? supabase
            .from('squad_memberships')
            .select('shirt_number, position, players ( id, known_as, full_name )')
            .eq('season_id', season.id)
            .eq('team_id', teamId)
        : Promise.resolve({ data: [] }),
      season
        ? supabase
            .from('season_player_stats')
            .select('player_id, goals, assists')
            .eq('season_id', season.id)
        : Promise.resolve({ data: [] }),
      supabase
        .from('fixtures')
        .select(
          `id, kickoff_at, status, home_team_id, away_team_id, home_score, away_score,
           home:teams!fixtures_home_team_id_fkey ( name, code ),
           away:teams!fixtures_away_team_id_fkey ( name, code )`,
        )
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order('kickoff_at', { ascending: true })
        .limit(20),
    ]);

  const statsByPlayer = new Map((stats ?? []).map((row) => [row.player_id, row]));

  return {
    id: team.id,
    name: team.name,
    code: team.code,
    position: standing?.position ?? null,
    points: standing?.points ?? null,
    form: standing?.form ?? null,
    squad: (squad ?? [])
      .map((row) => {
        const stat = row.players?.id ? statsByPlayer.get(row.players.id) : null;
        return {
          playerId: row.players?.id ?? '',
          name: row.players?.known_as ?? row.players?.full_name ?? 'Unknown',
          position: row.position,
          shirtNumber: row.shirt_number,
          goals: stat?.goals ?? 0,
          assists: stat?.assists ?? 0,
        };
      })
      .sort((a, b) => (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999)),
    fixtures: (fixtures ?? []).map((fixture) => {
      const home = fixture.home_team_id === teamId;
      return {
        id: fixture.id,
        kickoffAt: fixture.kickoff_at,
        status: fixture.status,
        opponent: (home ? fixture.away?.name : fixture.home?.name) ?? 'Unknown',
        opponentCode: (home ? fixture.away?.code : fixture.home?.code) ?? null,
        home,
        homeScore: fixture.home_score,
        awayScore: fixture.away_score,
      };
    }),
  };
}

export interface PlayerDetail {
  id: string;
  name: string;
  fullName: string;
  position: string | null;
  nationality: string | null;
  teamName: string | null;
  teamId: string | null;
  shirtNumber: number | null;
  goals: number;
  assists: number;
  appearances: number;
  /** How often they scored the opening goal — the first-scorer relevance flag. */
  firstGoals: number;
}

export async function getPlayer(playerId: string): Promise<PlayerDetail | null> {
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('id, full_name, known_as, position, nationality')
    .eq('id', playerId)
    .maybeSingle();

  if (!player) return null;

  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();

  const [{ data: membership }, { data: stats }, { data: goals }] = await Promise.all([
    season
      ? supabase
          .from('squad_memberships')
          .select('shirt_number, team_id, teams ( name )')
          .eq('season_id', season.id)
          .eq('player_id', playerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    season
      ? supabase
          .from('season_player_stats')
          .select('goals, assists, appearances')
          .eq('season_id', season.id)
          .eq('player_id', playerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('fixture_events')
      .select('fixture_id, minute, type')
      .eq('player_id', playerId)
      .in('type', ['goal', 'penalty_goal']),
  ]);

  // "Scored first" needs the earliest goal of each fixture, which means checking this
  // player's goals against every goal in those fixtures.
  const fixtureIds = [...new Set((goals ?? []).map((g) => g.fixture_id))];
  let firstGoals = 0;

  if (fixtureIds.length > 0) {
    const { data: allGoals } = await supabase
      .from('fixture_events')
      .select('fixture_id, minute, player_id, type')
      .in('fixture_id', fixtureIds)
      .in('type', ['goal', 'own_goal', 'penalty_goal']);

    const earliest = new Map<string, { minute: number; playerId: string | null }>();
    for (const event of allGoals ?? []) {
      const current = earliest.get(event.fixture_id);
      const minute = event.minute ?? 999;
      if (!current || minute < current.minute) {
        earliest.set(event.fixture_id, { minute, playerId: event.player_id });
      }
    }
    firstGoals = [...earliest.values()].filter((e) => e.playerId === playerId).length;
  }

  return {
    id: player.id,
    name: player.known_as ?? player.full_name,
    fullName: player.full_name,
    position: player.position,
    nationality: player.nationality,
    teamName: membership?.teams?.name ?? null,
    teamId: membership?.team_id ?? null,
    shirtNumber: membership?.shirt_number ?? null,
    goals: stats?.goals ?? 0,
    assists: stats?.assists ?? 0,
    appearances: stats?.appearances ?? 0,
    firstGoals,
  };
}
