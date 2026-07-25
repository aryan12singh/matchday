import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WEIGHTS,
  SEASON_TABLE_TEAM_COUNT,
  SELECTION_MODES,
  STAGE_FORMATS,
  correctScoreValueSchema,
  derivedHedges,
  firstGoalscorerValueSchema,
  fixturePresentation,
  isMarketWritable,
  leagueHasPrizes,
  parseMarketValue,
  resolveWeights,
  ruleSetDefinitionSchema,
  seasonTableValueSchema,
} from './index';

const teamIds = Array.from(
  { length: SEASON_TABLE_TEAM_COUNT },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);

describe('competition hierarchy', () => {
  it('models the stage formats from 05-domain-model.md', () => {
    expect(STAGE_FORMATS).toEqual(['round_robin', 'groups', 'knockout']);
  });

  it('models the league selection modes from addendum §B', () => {
    expect(SELECTION_MODES).toEqual(['all', 'admin_pick', 'vote']);
  });
});

describe('fixturePresentation', () => {
  it('shows editable only while the market is genuinely writable', () => {
    expect(fixturePresentation('scheduled', false)).toBe('editable');
    expect(fixturePresentation('scheduled', true)).toBe('locked');
    expect(fixturePresentation('lineups', true)).toBe('locked');
  });

  it('maps in-play states to live and finished states to settled', () => {
    expect(fixturePresentation('live', true)).toBe('live');
    expect(fixturePresentation('ht', true)).toBe('live');
    expect(fixturePresentation('finished', true)).toBe('settled');
    expect(fixturePresentation('settled', true)).toBe('settled');
  });

  it('voids postponed, abandoned and cancelled fixtures', () => {
    expect(fixturePresentation('postponed', true)).toBe('void');
    expect(fixturePresentation('abandoned', true)).toBe('void');
    expect(fixturePresentation('cancelled', true)).toBe('void');
  });

  it('treats an awarded result as settled, not void — it is a real result', () => {
    expect(fixturePresentation('awarded', true)).toBe('settled');
  });
});

describe('market writability', () => {
  const now = new Date('2026-08-21T18:00:00Z');

  it('is writable while open and before the lock', () => {
    expect(isMarketWritable({ status: 'open', locksAt: '2026-08-21T19:00:00Z' }, now)).toBe(true);
  });

  it('is closed exactly at the lock, with no grace window (addendum §H.5)', () => {
    expect(isMarketWritable({ status: 'open', locksAt: '2026-08-21T18:00:00Z' }, now)).toBe(false);
  });

  it('is closed once the status has moved on, whatever the clock says', () => {
    expect(isMarketWritable({ status: 'locked', locksAt: '2026-08-21T19:00:00Z' }, now)).toBe(false);
  });
});

describe('prediction values', () => {
  it('accepts a plain scoreline', () => {
    expect(correctScoreValueSchema.parse({ home: 2, away: 1 })).toEqual({ home: 2, away: 1 });
  });

  it('rejects a negative or fractional scoreline', () => {
    expect(() => correctScoreValueSchema.parse({ home: -1, away: 0 })).toThrow();
    expect(() => correctScoreValueSchema.parse({ home: 1.5, away: 0 })).toThrow();
  });

  it('derives the hedge markets exactly as the settlers will read them', () => {
    expect(derivedHedges({ home: 3, away: 1 })).toEqual({
      goalDiff: 2,
      totalGoals: 4,
      btts: true,
    });
    expect(derivedHedges({ home: 2, away: 0 }).btts).toBe(false);
  });

  it('refuses a first-scorer answer that is both a player and "no scorer"', () => {
    expect(() =>
      firstGoalscorerValueSchema.parse({
        playerId: '00000000-0000-4000-8000-000000000001',
        none: true,
      }),
    ).toThrow();
  });

  it('accepts "no scorer" as a deliberate answer', () => {
    expect(firstGoalscorerValueSchema.parse({ playerId: null, none: true }).none).toBe(true);
  });

  it('requires the season table to rank every team exactly once', () => {
    expect(seasonTableValueSchema.parse({ order: teamIds }).order).toHaveLength(20);
    expect(() => seasonTableValueSchema.parse({ order: teamIds.slice(0, 19) })).toThrow();
    expect(() =>
      seasonTableValueSchema.parse({ order: [teamIds[0]!, ...teamIds.slice(0, 19)] }),
    ).toThrow();
  });

  it('parses by market code', () => {
    expect(parseMarketValue('btts', { value: true })).toEqual({ value: true });
    expect(parseMarketValue('goal_diff', {})).toEqual({ value: null });
  });
});

describe('rule sets', () => {
  it('resolves the seeded v1 weights, with team_goals held at zero', () => {
    const definition = ruleSetDefinitionSchema.parse({
      categories: {
        outcome: { enabled: true, weight: 3 },
        exact: { enabled: true, weight: 3 },
        goal_diff: { enabled: true, weight: 2 },
        total_goals: { enabled: true, weight: 1 },
        team_goals: { enabled: true, weight: 0 },
        btts: { enabled: true, weight: 1 },
        first_team: { enabled: true, weight: 2 },
        first_scorer: { enabled: true, weight: 4 },
      },
      tiebreaks: ['points', 'outcome', 'exact', 'submissions'],
    });
    expect(resolveWeights(definition)).toEqual(DEFAULT_WEIGHTS);
  });

  it('treats a disabled category as weight zero regardless of its stored weight', () => {
    const definition = ruleSetDefinitionSchema.parse({
      categories: { first_scorer: { enabled: false, weight: 4 } },
      tiebreaks: ['points'],
    });
    expect(resolveWeights(definition).first_scorer).toBe(0);
  });
});

describe('prize gating', () => {
  it('hides money UI for a league with no prize scheme', () => {
    expect(leagueHasPrizes({ prizeSchemeId: null })).toBe(false);
    expect(leagueHasPrizes({ prizeSchemeId: 'x' as never })).toBe(true);
  });
});
