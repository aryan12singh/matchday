import type {
  ProviderEvent,
  ProviderEventType,
  ProviderFixture,
  ProviderFixtureStatus,
  ProviderPlayer,
  ProviderStanding,
  ProviderTeam,
  ProviderTopScorer,
} from './adapter';

/**
 * API-Football normalizers. Pure functions from a raw payload to provider-neutral shapes.
 *
 * They are separated from the HTTP client so they can be tested against archived
 * payloads with no network and no key — which is the whole point of the cassette
 * approach, and the reason a normalizer bug is recoverable: re-run it over raw_payloads
 * rather than re-fetching on a prepaid quota.
 *
 * These were originally written against API-Football's published v3 shapes, with no way to
 * confirm the input. As of 30 July 2026 they are verified against real captured responses
 * (cassettes.test.ts, payloads in ../cassettes/) and every branch below held on first
 * contact — including the three that decide money-adjacent outcomes:
 *
 *   {type: "Goal", detail: "Penalty"}    → penalty_goal
 *   {type: "Goal", detail: "Own Goal"}   → own_goal      (no first-scorer pick can hit it)
 *   {type: "Var",  detail: "Penalty confirmed"} → var    (NOT a goal, despite the word)
 *
 * That last one is the trap: a naive detail match on /penalty/ would count a VAR line as a
 * goal and hand first-scorer points to the wrong player.
 */

/** API-Football's status short codes → our fixture state machine. */
const STATUS_MAP: Record<string, ProviderFixtureStatus> = {
  TBD: 'scheduled',
  NS: 'scheduled',
  '1H': 'live',
  HT: 'ht',
  '2H': 'live',
  ET: 'live',
  BT: 'live',
  P: 'live',
  SUSP: 'live',
  INT: 'live',
  LIVE: 'live',
  FT: 'finished',
  AET: 'finished',
  PEN: 'finished',
  PST: 'postponed',
  CANC: 'cancelled',
  ABD: 'abandoned',
  AWD: 'awarded',
  WO: 'awarded',
};

export function normalizeStatus(short: unknown): ProviderFixtureStatus {
  const code = typeof short === 'string' ? short.toUpperCase() : '';
  // Unknown codes are treated as scheduled rather than thrown away: a fixture we cannot
  // classify still needs to exist, and a wrong "scheduled" is visible and fixable where a
  // missing fixture is neither.
  return STATUS_MAP[code] ?? 'scheduled';
}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

interface ApiEnvelope {
  response?: unknown[];
}

const responseArray = (payload: unknown): Record<string, unknown>[] => {
  const envelope = payload as ApiEnvelope;
  return Array.isArray(envelope?.response)
    ? (envelope.response as Record<string, unknown>[])
    : [];
};

export function normalizeTeams(payload: unknown): ProviderTeam[] {
  return responseArray(payload).map((entry) => {
    const team = (entry.team ?? entry) as Record<string, unknown>;
    return {
      providerId: String(team.id),
      name: String(team.name ?? 'Unknown'),
      shortName: asString(team.name),
      code: asString(team.code),
      country: asString(team.country),
      crestUrl: asString(team.logo),
    };
  });
}

export function normalizeSquad(payload: unknown, teamProviderId: string): ProviderPlayer[] {
  const players: ProviderPlayer[] = [];

  for (const entry of responseArray(payload)) {
    // Squads come back as { team, players: [...] }; the players endpoint returns
    // { player, statistics: [...] }. Handle both rather than assuming one caller.
    const list = Array.isArray(entry.players)
      ? (entry.players as Record<string, unknown>[])
      : entry.player
        ? [entry.player as Record<string, unknown>]
        : [];

    for (const player of list) {
      players.push({
        providerId: String(player.id),
        fullName: String(player.name ?? 'Unknown'),
        knownAs: asString(player.name),
        position: asString(player.position),
        nationality: asString(player.nationality),
        photoUrl: asString(player.photo),
        shirtNumber: asNumber(player.number),
        teamProviderId,
      });
    }
  }

  return players;
}

export function normalizeFixtures(payload: unknown): ProviderFixture[] {
  return responseArray(payload).map((entry) => {
    const fixture = (entry.fixture ?? {}) as Record<string, unknown>;
    const teams = (entry.teams ?? {}) as Record<string, Record<string, unknown>>;
    const goals = (entry.goals ?? {}) as Record<string, unknown>;
    const score = (entry.score ?? {}) as Record<string, Record<string, unknown>>;
    const league = (entry.league ?? {}) as Record<string, unknown>;
    const status = (fixture.status ?? {}) as Record<string, unknown>;
    const venue = (fixture.venue ?? {}) as Record<string, unknown>;

    const roundLabel = String(league.round ?? '');

    return {
      providerId: String(fixture.id),
      roundLabel,
      roundNumber: parseRoundNumber(roundLabel),
      kickoffAt: new Date(String(fixture.date)).toISOString(),
      status: normalizeStatus(status.short),
      minute: asNumber(status.elapsed),
      homeTeamProviderId: String(teams.home?.id),
      awayTeamProviderId: String(teams.away?.id),
      homeScore: asNumber(goals.home),
      awayScore: asNumber(goals.away),
      htHome: asNumber(score.halftime?.home),
      htAway: asNumber(score.halftime?.away),
      venue: asString(venue.name),
    };
  });
}

/** "Regular Season - 14" → 14. Null for cup rounds that have no number. */
export function parseRoundNumber(label: string): number | null {
  const match = /(\d+)\s*$/.exec(label.trim());
  return match?.[1] != null ? Number(match[1]) : null;
}

const EVENT_TYPE_MAP: Array<[RegExp, RegExp | null, ProviderEventType]> = [
  [/^goal$/i, /own goal/i, 'own_goal'],
  [/^goal$/i, /penalty/i, 'penalty_goal'],
  [/^goal$/i, /missed penalty/i, 'missed_penalty'],
  [/^goal$/i, null, 'goal'],
  [/^card$/i, /yellow/i, 'yellow'],
  [/^card$/i, /red/i, 'red'],
  [/^subst/i, null, 'substitution'],
  [/^var$/i, null, 'var'],
];

export function normalizeEventType(type: unknown, detail: unknown): ProviderEventType | null {
  const typeText = String(type ?? '');
  const detailText = String(detail ?? '');

  // Order matters: "Missed Penalty" and "Penalty" both match /penalty/, so the more
  // specific detail is checked first in the table above.
  if (/missed penalty/i.test(detailText)) return 'missed_penalty';

  for (const [typePattern, detailPattern, result] of EVENT_TYPE_MAP) {
    if (!typePattern.test(typeText)) continue;
    if (detailPattern == null || detailPattern.test(detailText)) return result;
  }

  return null;
}

export function normalizeEvents(payload: unknown, fixtureProviderId: string): ProviderEvent[] {
  const events: ProviderEvent[] = [];

  responseArray(payload).forEach((entry, index) => {
    const type = normalizeEventType(entry.type, entry.detail);
    if (type == null) return;

    const time = (entry.time ?? {}) as Record<string, unknown>;
    const team = (entry.team ?? {}) as Record<string, unknown>;
    const player = (entry.player ?? {}) as Record<string, unknown>;
    const assist = (entry.assist ?? {}) as Record<string, unknown>;

    const minute = asNumber(time.elapsed);
    const added = asNumber(time.extra);

    events.push({
      // API-Football has no event id, so the key is composed from the fields that
      // identify an event. The index is the tiebreak for the genuinely rare case of two
      // identical events in the same minute — without it, re-ingest would drop one.
      providerEventKey: [
        fixtureProviderId,
        minute ?? 'x',
        added ?? 0,
        type,
        player.id ?? 'x',
        index,
      ].join(':'),
      fixtureProviderId,
      type,
      minute,
      addedMinute: added,
      teamProviderId: team.id != null ? String(team.id) : null,
      playerProviderId: player.id != null ? String(player.id) : null,
      assistPlayerProviderId: assist.id != null ? String(assist.id) : null,
    });
  });

  return events;
}

export function normalizeStandings(payload: unknown): ProviderStanding[] {
  const rows: ProviderStanding[] = [];

  for (const entry of responseArray(payload)) {
    const league = (entry.league ?? {}) as Record<string, unknown>;
    // standings is an array of groups, each an array of rows.
    const groups = Array.isArray(league.standings)
      ? (league.standings as Record<string, unknown>[][])
      : [];

    for (const group of groups) {
      for (const row of group) {
        const team = (row.team ?? {}) as Record<string, unknown>;
        const all = (row.all ?? {}) as Record<string, unknown>;
        const goals = (all.goals ?? {}) as Record<string, unknown>;

        rows.push({
          teamProviderId: String(team.id),
          position: Number(row.rank ?? 0),
          played: Number(all.played ?? 0),
          won: Number(all.win ?? 0),
          drawn: Number(all.draw ?? 0),
          lost: Number(all.lose ?? 0),
          goalsFor: Number(goals.for ?? 0),
          goalsAgainst: Number(goals.against ?? 0),
          points: Number(row.points ?? 0),
          form: asString(row.form),
        });
      }
    }
  }

  return rows;
}

export function normalizeTopScorers(payload: unknown): ProviderTopScorer[] {
  return responseArray(payload).map((entry) => {
    const player = (entry.player ?? {}) as Record<string, unknown>;
    const statistics = Array.isArray(entry.statistics)
      ? (entry.statistics as Record<string, unknown>[])
      : [];
    const first = statistics[0] ?? {};
    const team = (first.team ?? {}) as Record<string, unknown>;
    const goals = (first.goals ?? {}) as Record<string, unknown>;

    return {
      playerProviderId: String(player.id),
      teamProviderId: team.id != null ? String(team.id) : null,
      goals: Number(goals.total ?? 0),
    };
  });
}

/**
 * Which goal opened the scoring, and whether it was an own goal.
 *
 * An own goal counts for the opposing team, and no first-scorer pick can hit it — the
 * settler needs both facts, and this is where the event stream is the only place they
 * exist.
 */
export function firstGoal(
  events: readonly ProviderEvent[],
): { event: ProviderEvent; isOwnGoal: boolean } | null {
  const goals = events
    .filter((e) => e.type === 'goal' || e.type === 'own_goal' || e.type === 'penalty_goal')
    .sort(
      (a, b) =>
        (a.minute ?? 999) - (b.minute ?? 999) || (a.addedMinute ?? 0) - (b.addedMinute ?? 0),
    );

  const first = goals[0];
  return first ? { event: first, isOwnGoal: first.type === 'own_goal' } : null;
}
