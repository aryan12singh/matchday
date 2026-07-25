import 'server-only';

import { createClient } from './supabase/server';

/**
 * League reads. Every query here relies on RLS to scope rows to the caller's leagues —
 * there is no `where user_id = ...` because the policy already applied it, and adding one
 * would hide policy bugs rather than defend against them.
 */

export interface LeagueSummary {
  id: string;
  name: string;
  memberCount: number;
  role: 'organizer' | 'member';
  /** Null when the league has not enrolled in a season yet. */
  leagueSeasonId: string | null;
  seasonLabel: string | null;
  /** design/README.md §6: null means render no money UI anywhere for this league. */
  prizeSchemeId: string | null;
  selectionMode: 'all' | 'admin_pick' | 'vote';
  revealPolicy: 'at_kickoff' | 'always' | 'after_own_submission';
}

export async function getMyLeagues(userId: string): Promise<LeagueSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('league_members')
    .select(
      `role,
       leagues!inner (
         id,
         name,
         league_seasons ( id, season_id, prize_scheme_id, selection_mode, reveal_policy,
                          seasons ( label, is_current ) ),
         league_members ( user_id )
       )`,
    )
    .eq('user_id', userId);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const league = row.leagues;
    // A league can span seasons; the current one is what the UI cares about.
    const seasons = league.league_seasons ?? [];
    const current = seasons.find((s) => s.seasons?.is_current) ?? seasons[0] ?? null;

    return {
      id: league.id,
      name: league.name,
      memberCount: league.league_members?.length ?? 0,
      role: row.role as 'organizer' | 'member',
      leagueSeasonId: current?.id ?? null,
      seasonLabel: current?.seasons?.label ?? null,
      prizeSchemeId: current?.prize_scheme_id ?? null,
      selectionMode: (current?.selection_mode ?? 'all') as LeagueSummary['selectionMode'],
      revealPolicy: (current?.reveal_policy ?? 'at_kickoff') as LeagueSummary['revealPolicy'],
    };
  });
}

export interface LeagueDetail extends LeagueSummary {
  members: Array<{ userId: string; username: string; avatarUrl: string | null; role: string }>;
  /** Only ever non-null for an organizer — read through league_join_code(). */
  joinCode: string | null;
}

export async function getLeague(leagueId: string): Promise<LeagueDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('leagues')
    .select(
      `id,
       name,
       league_seasons ( id, prize_scheme_id, selection_mode, reveal_policy,
                        seasons ( label, is_current ) ),
       league_members ( user_id, role, profiles ( username, avatar_url ) )`,
    )
    .eq('id', leagueId)
    .maybeSingle();

  // Not an error: a non-member simply sees no rows, which is the policy working.
  if (error || !data) return null;

  const seasons = data.league_seasons ?? [];
  const current = seasons.find((s) => s.seasons?.is_current) ?? seasons[0] ?? null;
  const members = data.league_members ?? [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = members.find((m) => m.user_id === user?.id);

  // Returns null unless the caller is an organizer; the column itself is not readable.
  const { data: joinCode } = await supabase.rpc('league_join_code', { p_league_id: leagueId });

  return {
    id: data.id,
    name: data.name,
    memberCount: members.length,
    role: (me?.role ?? 'member') as 'organizer' | 'member',
    leagueSeasonId: current?.id ?? null,
    seasonLabel: current?.seasons?.label ?? null,
    prizeSchemeId: current?.prize_scheme_id ?? null,
    selectionMode: (current?.selection_mode ?? 'all') as LeagueSummary['selectionMode'],
    revealPolicy: (current?.reveal_policy ?? 'at_kickoff') as LeagueSummary['revealPolicy'],
    members: members.map((m) => ({
      userId: m.user_id,
      username: m.profiles?.username ?? 'player',
      avatarUrl: m.profiles?.avatar_url ?? null,
      role: m.role,
    })),
    joinCode: joinCode ?? null,
  };
}

/** Preview for the join flow: name and size for a valid code, and nothing else. */
export async function previewLeague(code: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('preview_league', { p_code: code });
  if (error || !data || data.length === 0) return null;

  const row = data[0]!;
  return { id: row.league_id, name: row.name, memberCount: Number(row.member_count) };
}

/** The season every new league enrols in — the current one. */
export async function getCurrentSeason() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('seasons')
    .select('id, label, first_kickoff_at, competitions ( name )')
    .eq('is_current', true)
    .maybeSingle();

  return data
    ? {
        id: data.id,
        label: data.label,
        firstKickoffAt: data.first_kickoff_at,
        competitionName: data.competitions?.name ?? 'Competition',
      }
    : null;
}
