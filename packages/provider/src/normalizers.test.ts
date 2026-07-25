import { describe, expect, it } from 'vitest';

import {
  firstGoal,
  normalizeEventType,
  normalizeEvents,
  normalizeFixtures,
  normalizeStandings,
  normalizeStatus,
  normalizeTeams,
  normalizeTopScorers,
  parseRoundNumber,
} from './normalizers';

/**
 * Normalizer vectors.
 *
 * These payloads are built to API-Football's *documented* v3 shapes, not captured from
 * live responses — Task 6 cassette capture is blocked on the API key. They therefore pin
 * the transformation, not the input. Replace them with real cassettes once a key exists;
 * the assertions should survive unchanged if the docs are accurate, and any that do not
 * are exactly the surprises Task 6 exists to find.
 */

describe('normalizeStatus', () => {
  it('maps the in-play codes to live states', () => {
    expect(normalizeStatus('1H')).toBe('live');
    expect(normalizeStatus('2H')).toBe('live');
    expect(normalizeStatus('ET')).toBe('live');
    expect(normalizeStatus('HT')).toBe('ht');
  });

  it('maps every finished variant to finished', () => {
    for (const code of ['FT', 'AET', 'PEN']) {
      expect(normalizeStatus(code)).toBe('finished');
    }
  });

  it('distinguishes the void-ish outcomes, which score differently', () => {
    expect(normalizeStatus('PST')).toBe('postponed');
    expect(normalizeStatus('ABD')).toBe('abandoned');
    expect(normalizeStatus('CANC')).toBe('cancelled');
    // An awarded result is a real result: it settles rather than voids.
    expect(normalizeStatus('AWD')).toBe('awarded');
    expect(normalizeStatus('WO')).toBe('awarded');
  });

  it('treats an unknown code as scheduled rather than dropping the fixture', () => {
    expect(normalizeStatus('WHAT')).toBe('scheduled');
    expect(normalizeStatus(undefined)).toBe('scheduled');
  });
});

describe('parseRoundNumber', () => {
  it('pulls the matchweek out of a league round label', () => {
    expect(parseRoundNumber('Regular Season - 14')).toBe(14);
    expect(parseRoundNumber('Regular Season - 1')).toBe(1);
  });

  it('returns null for cup rounds that have no number', () => {
    expect(parseRoundNumber('Quarter-finals')).toBeNull();
  });
});

describe('normalizeFixtures', () => {
  const payload = {
    response: [
      {
        fixture: {
          id: 1035037,
          date: '2026-08-21T19:00:00+00:00',
          status: { short: 'NS', elapsed: null },
          venue: { name: 'Emirates Stadium' },
        },
        league: { round: 'Regular Season - 1' },
        teams: { home: { id: 42 }, away: { id: 49 } },
        goals: { home: null, away: null },
        score: { halftime: { home: null, away: null } },
      },
    ],
  };

  it('normalizes a scheduled fixture', () => {
    const [fixture] = normalizeFixtures(payload);
    expect(fixture).toMatchObject({
      providerId: '1035037',
      roundNumber: 1,
      status: 'scheduled',
      homeTeamProviderId: '42',
      awayTeamProviderId: '49',
      venue: 'Emirates Stadium',
    });
  });

  it('normalizes kickoff to UTC ISO, whatever offset the provider sends', () => {
    const [fixture] = normalizeFixtures(payload);
    expect(fixture!.kickoffAt).toBe('2026-08-21T19:00:00.000Z');
  });

  it('keeps provider ids as strings — they are never used as numbers', () => {
    const [fixture] = normalizeFixtures(payload);
    expect(typeof fixture!.providerId).toBe('string');
    expect(typeof fixture!.homeTeamProviderId).toBe('string');
  });

  it('returns an empty array rather than throwing on a malformed envelope', () => {
    expect(normalizeFixtures({})).toEqual([]);
    expect(normalizeFixtures(null)).toEqual([]);
  });
});

describe('normalizeEventType', () => {
  it('separates the three kinds of goal, which score differently', () => {
    expect(normalizeEventType('Goal', 'Normal Goal')).toBe('goal');
    expect(normalizeEventType('Goal', 'Own Goal')).toBe('own_goal');
    expect(normalizeEventType('Goal', 'Penalty')).toBe('penalty_goal');
  });

  it('does not mistake a missed penalty for a scored one', () => {
    // Both details contain "Penalty"; getting this wrong would award a goal that never
    // happened and, worse, a first-scorer hit.
    expect(normalizeEventType('Goal', 'Missed Penalty')).toBe('missed_penalty');
  });

  it('maps cards and substitutions', () => {
    expect(normalizeEventType('Card', 'Yellow Card')).toBe('yellow');
    expect(normalizeEventType('Card', 'Red Card')).toBe('red');
    expect(normalizeEventType('subst', 'Substitution 1')).toBe('substitution');
  });

  it('returns null for anything it does not recognise', () => {
    expect(normalizeEventType('Nonsense', '')).toBeNull();
  });
});

describe('normalizeEvents', () => {
  const payload = {
    response: [
      {
        time: { elapsed: 23, extra: null },
        team: { id: 42 },
        player: { id: 1100 },
        assist: { id: 1101 },
        type: 'Goal',
        detail: 'Normal Goal',
      },
      {
        time: { elapsed: 67, extra: null },
        team: { id: 49 },
        player: { id: 2200 },
        assist: { id: null },
        type: 'Goal',
        detail: 'Own Goal',
      },
      {
        time: { elapsed: 80, extra: null },
        team: { id: 49 },
        player: { id: 2201 },
        type: 'Nonsense',
        detail: '',
      },
    ],
  };

  it('drops events it cannot classify rather than inventing a type', () => {
    expect(normalizeEvents(payload, '1035037')).toHaveLength(2);
  });

  it('produces a stable idempotency key so re-ingest cannot duplicate', () => {
    const first = normalizeEvents(payload, '1035037');
    const second = normalizeEvents(payload, '1035037');
    expect(first.map((e) => e.providerEventKey)).toEqual(second.map((e) => e.providerEventKey));
  });

  it('keeps two identical events in the same minute distinct', () => {
    // Without the index in the key, re-ingesting a double would silently drop one.
    const doubled = {
      response: [
        { time: { elapsed: 23 }, team: { id: 42 }, player: { id: 1100 }, type: 'Goal', detail: 'Normal Goal' },
        { time: { elapsed: 23 }, team: { id: 42 }, player: { id: 1100 }, type: 'Goal', detail: 'Normal Goal' },
      ],
    };
    const events = normalizeEvents(doubled, '1035037');
    expect(new Set(events.map((e) => e.providerEventKey)).size).toBe(2);
  });
});

describe('firstGoal', () => {
  it('picks the earliest goal and flags an own goal', () => {
    const events = normalizeEvents(
      {
        response: [
          { time: { elapsed: 67 }, team: { id: 49 }, player: { id: 2200 }, type: 'Goal', detail: 'Normal Goal' },
          { time: { elapsed: 12 }, team: { id: 42 }, player: { id: 1100 }, type: 'Goal', detail: 'Own Goal' },
        ],
      },
      '1',
    );

    const result = firstGoal(events);
    expect(result?.event.minute).toBe(12);
    expect(result?.isOwnGoal).toBe(true);
  });

  it('breaks a same-minute tie on added time', () => {
    const events = normalizeEvents(
      {
        response: [
          { time: { elapsed: 45, extra: 3 }, team: { id: 49 }, player: { id: 1 }, type: 'Goal', detail: 'Normal Goal' },
          { time: { elapsed: 45, extra: 1 }, team: { id: 42 }, player: { id: 2 }, type: 'Goal', detail: 'Normal Goal' },
        ],
      },
      '1',
    );
    expect(firstGoal(events)?.event.playerProviderId).toBe('2');
  });

  it('returns null for a goalless match', () => {
    expect(firstGoal([])).toBeNull();
  });
});

describe('normalizeTeams', () => {
  it('reads the nested team envelope', () => {
    const teams = normalizeTeams({
      response: [{ team: { id: 42, name: 'Arsenal', code: 'ARS', country: 'England', logo: 'x' } }],
    });
    expect(teams[0]).toMatchObject({ providerId: '42', name: 'Arsenal', code: 'ARS' });
  });
});

describe('normalizeStandings', () => {
  it('flattens the group-of-groups shape', () => {
    const standings = normalizeStandings({
      response: [
        {
          league: {
            standings: [
              [
                {
                  rank: 1,
                  team: { id: 42 },
                  points: 86,
                  form: 'WWDWW',
                  all: { played: 38, win: 27, draw: 5, lose: 6, goals: { for: 88, against: 40 } },
                },
              ],
            ],
          },
        },
      ],
    });

    expect(standings).toHaveLength(1);
    expect(standings[0]).toMatchObject({ teamProviderId: '42', position: 1, points: 86 });
  });
});

describe('normalizeTopScorers', () => {
  it('reads goals from the first statistics entry', () => {
    const scorers = normalizeTopScorers({
      response: [
        { player: { id: 1100 }, statistics: [{ team: { id: 42 }, goals: { total: 24 } }] },
      ],
    });
    expect(scorers[0]).toEqual({ playerProviderId: '1100', teamProviderId: '42', goals: 24 });
  });
});
