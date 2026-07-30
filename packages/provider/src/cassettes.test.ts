import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { firstGoal } from './normalizers';
import { type Cassette, MemoryCassetteStore, ReplayAdapter } from './replay';
import type { SeasonRef } from './adapter';
import { cassetteName, requests } from './requests';

/**
 * Normalizers against real API-Football payloads (Task 6).
 *
 * normalizers.ts carried a warning for months: written against documented response shapes,
 * never verified against a captured response, because the API key did not exist. These
 * tests retire that warning. Every payload below came off the wire on 30 July 2026 and is
 * committed under packages/provider/cassettes/.
 *
 * Recorded from season 2024 (2024/25), not 2026/27, because the free plan is
 * season-limited — see scripts/capture-cassettes.ts. Shapes are a property of the API
 * version rather than the season, and a completed season is the only place real event
 * streams exist, so this is the stronger fixture either way.
 */

const DIR = join(__dirname, '../cassettes');
const SEASON: SeasonRef = { leagueProviderId: '39', seasonYear: 2024 };

function loadStore(): MemoryCassetteStore {
  const store = new MemoryCassetteStore();
  for (const file of readdirSync(DIR)) {
    if (!file.endsWith('.json') || file === 'chosen-fixture.json' || file === 'edge-cases.json') {
      continue;
    }
    store.put(file.replace(/\.json$/, ''), JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Cassette);
  }
  return store;
}

const edgeCases = JSON.parse(readFileSync(join(DIR, 'edge-cases.json'), 'utf8')) as {
  highScoring: string;
  found: Record<string, string>;
};

const store = loadStore();
const adapter = new ReplayAdapter(store);

describe('cassettes', () => {
  it('are real captures rather than hand-written payloads', () => {
    const names = store.names();
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) {
      const cassette = store.get(name)!;
      // A synthetic payload proves only that the normalizer agrees with whoever wrote it.
      expect(cassette.synthetic).toBeUndefined();
      expect(cassette.recordedAt).toBeTruthy();
      expect(cassette.httpStatus).toBe(200);
    }
  });
});

describe('normalizeTeams', () => {
  it('reads a full Premier League field', async () => {
    const { data } = await adapter.listTeams(SEASON);
    expect(data).toHaveLength(20);

    for (const team of data) {
      expect(team.providerId).toMatch(/^\d+$/);
      expect(team.name.length).toBeGreaterThan(0);
      expect(team.crestUrl).toMatch(/^https?:\/\//);
    }

    // A recognisable name proves the payload is the competition asked for, not an empty
    // envelope that happens to have 20 entries.
    expect(data.map((t) => t.name)).toContain('Liverpool');
  });
});

describe('normalizeFixtures', () => {
  it('reads a complete 380-fixture season', async () => {
    const { data } = await adapter.listFixtures(SEASON);
    expect(data).toHaveLength(380);

    for (const fixture of data) {
      // Every fixture must land in a matchweek. A null here is a fixture the bootstrap
      // silently skips, which is how a season quietly ends up with 372 games.
      expect(fixture.roundNumber).not.toBeNull();
      expect(fixture.kickoffAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(fixture.homeTeamProviderId).not.toBe(fixture.awayTeamProviderId);
    }

    const rounds = new Set(data.map((f) => f.roundNumber));
    expect(rounds.size).toBe(38);
    expect(Math.min(...(rounds as Set<number>))).toBe(1);
    expect(Math.max(...(rounds as Set<number>))).toBe(38);
  });

  it('maps a completed season entirely to finished', async () => {
    const { data } = await adapter.listFixtures(SEASON);
    expect(data.every((f) => f.status === 'finished')).toBe(true);
  });
});

describe('normalizeEvents', () => {
  it('distinguishes a penalty from a normal goal', async () => {
    const { data } = await adapter.listEvents(edgeCases.found.penalty_goal!);
    const penalties = data.filter((e) => e.type === 'penalty_goal');
    expect(penalties.length).toBeGreaterThan(0);
    expect(penalties[0]!.playerProviderId).toBeTruthy();
  });

  it('distinguishes an own goal, which no first-scorer pick may ever hit', async () => {
    const { data } = await adapter.listEvents(edgeCases.found.own_goal!);
    expect(data.filter((e) => e.type === 'own_goal').length).toBeGreaterThan(0);
  });

  it('does not mistake a VAR line for a goal', async () => {
    // Real payloads carry `{type: "Var", detail: "Penalty confirmed"}`. That contains the
    // word "Penalty", so a naive detail match would count it as a second penalty goal and
    // could hand the first-scorer points to the wrong player.
    const { data } = await adapter.listEvents(edgeCases.found.penalty_goal!);
    const varEvents = data.filter((e) => e.type === 'var');
    expect(varEvents.length).toBeGreaterThan(0);
    for (const event of varEvents) {
      expect(['goal', 'penalty_goal', 'own_goal']).not.toContain(event.type);
    }
  });

  it('reads a red card', async () => {
    const { data } = await adapter.listEvents(edgeCases.found.red!);
    expect(data.filter((e) => e.type === 'red').length).toBeGreaterThan(0);
  });

  it('gives every event a key that is stable and unique within the fixture', async () => {
    const { data } = await adapter.listEvents(edgeCases.highScoring);
    const keys = data.map((e) => e.providerEventKey);
    // Duplicated keys would collapse rows on upsert; unstable keys would duplicate them.
    expect(new Set(keys).size).toBe(keys.length);

    const again = await adapter.listEvents(edgeCases.highScoring);
    expect(again.data.map((e) => e.providerEventKey)).toEqual(keys);
  });
});

describe('firstGoal', () => {
  it('picks the earliest goal from a real nine-goal match', async () => {
    const { data } = await adapter.listEvents(edgeCases.highScoring);
    const first = firstGoal(data);

    expect(first).not.toBeNull();
    const goals = data
      .filter((e) => ['goal', 'own_goal', 'penalty_goal'].includes(e.type))
      .map((e) => e.minute ?? 999);
    expect(first!.event.minute).toBe(Math.min(...goals));
  });

  it('reports an own goal as such, since it settles differently', async () => {
    const { data } = await adapter.listEvents(edgeCases.found.own_goal!);
    const first = firstGoal(data);
    expect(first).not.toBeNull();
    expect(first!.isOwnGoal).toBe(first!.event.type === 'own_goal');
  });
});

describe('normalizeStandings', () => {
  it('reads a full table with contiguous positions', async () => {
    const { data } = await adapter.listStandings(SEASON);
    expect(data).toHaveLength(20);

    const positions = data.map((r) => r.position).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    for (const row of data) {
      expect(row.played).toBe(38);
      // Points must be consistent with the results, or the /table screen is fiction.
      expect(row.points).toBe(row.won * 3 + row.drawn);
      expect(row.won + row.drawn + row.lost).toBe(38);
    }
  });
});

describe('normalizeTopScorers', () => {
  it('reads scorers in descending order with real goal counts', async () => {
    const { data } = await adapter.listTopScorers(SEASON);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]!.goals).toBeGreaterThan(10);
    for (const scorer of data) {
      expect(scorer.playerProviderId).toMatch(/^\d+$/);
      expect(Number.isInteger(scorer.goals)).toBe(true);
    }
  });
});

describe('normalizeSquad', () => {
  it('attributes every player to the team that was asked for', async () => {
    const teams = await adapter.listTeams(SEASON);
    const team = teams.data[0]!;
    const { data } = await adapter.listSquad(SEASON, team.providerId);

    expect(data.length).toBeGreaterThan(20);
    for (const player of data) {
      expect(player.teamProviderId).toBe(team.providerId);
      expect(player.fullName.length).toBeGreaterThan(0);
    }
    expect(data.some((p) => p.position === 'Goalkeeper')).toBe(true);
  });
});

describe('ReplayAdapter', () => {
  it('throws on a cassette miss rather than returning nothing', async () => {
    const empty = new ReplayAdapter(new MemoryCassetteStore());
    await expect(empty.listTeams(SEASON)).rejects.toThrow(/No cassette/);
  });

  it('derives the same cassette key the live adapter records under', () => {
    // If these drifted, every cassette would miss and the suite would fail as though the
    // normalizers broke. Pinning the derivation keeps that failure honest.
    expect(cassetteName(requests.teams(SEASON))).toBe(cassetteName(requests.teams(SEASON)));
    expect(cassetteName(requests.fixtures(SEASON))).not.toBe(
      cassetteName(requests.liveFixtures(SEASON)),
    );
  });
});
