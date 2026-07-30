import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizeFplFixtures, normalizeFplSquad, normalizeFplTeams } from './fpl';

/**
 * FPL normalizers against real captured payloads.
 *
 * This is the source for the one thing API-Football's free plan cannot provide — the
 * 38-matchweek schedule — so the assertions are about whether a season is *complete and
 * usable*, not merely parseable. A fixture list that is 372 games long, or that has a
 * gameweek missing, produces an app that looks fine and is quietly wrong.
 */

const DIR = join(__dirname, '../cassettes/fpl');
const bootstrap = JSON.parse(readFileSync(join(DIR, 'bootstrap-static.json'), 'utf8')).raw;
const fixturesRaw = JSON.parse(readFileSync(join(DIR, 'fixtures.json'), 'utf8')).raw;

describe('normalizeFplTeams', () => {
  it('reads the full 2026/27 field', () => {
    const teams = normalizeFplTeams(bootstrap);
    expect(teams).toHaveLength(20);

    for (const team of teams) {
      expect(team.providerId).toMatch(/^\d+$/);
      expect(team.name.length).toBeGreaterThan(0);
      expect(team.shortName).toMatch(/^[A-Z]{3}$/);
      expect(team.crestUrl).toMatch(/^https:\/\/resources\.premierleague\.com\//);
    }

    expect(teams.map((t) => t.name)).toContain('Arsenal');
    expect(new Set(teams.map((t) => t.providerId)).size).toBe(20);
  });
});

describe('normalizeFplSquad', () => {
  it('returns a plausible squad for a club', () => {
    const teams = normalizeFplTeams(bootstrap);
    const team = teams[0]!;
    const squad = normalizeFplSquad(bootstrap, team.providerId);

    expect(squad.length).toBeGreaterThan(15);
    for (const player of squad) {
      expect(player.teamProviderId).toBe(team.providerId);
      expect(player.fullName.length).toBeGreaterThan(0);
      expect(player.knownAs).toBeTruthy();
    }

    // Every position must be represented, or the first-scorer picker is searching a
    // partial squad — and a goalkeeper missing means the squad is filtered wrong.
    const positions = new Set(squad.map((p) => p.position));
    expect(positions).toContain('Goalkeeper');
    expect(positions).toContain('Defender');
    expect(positions).toContain('Midfielder');
    expect(positions).toContain('Forward');
  });

  it('partitions every player into exactly one club', () => {
    const teams = normalizeFplTeams(bootstrap);
    const counts = teams.map((t) => normalizeFplSquad(bootstrap, t.providerId).length);
    const total = counts.reduce((a, b) => a + b, 0);

    // No player may be missing from every squad or appear in two.
    expect(total).toBe((bootstrap as { elements: unknown[] }).elements.length);
    expect(Math.min(...counts)).toBeGreaterThan(15);
  });

  it('keeps both name forms, because the picker is searched by either', () => {
    const squad = normalizeFplSquad(bootstrap, '1');
    const withDistinctNames = squad.filter((p) => p.knownAs !== p.fullName);
    // "Raya" vs "David Raya Martín" — searching either has to find the player.
    expect(withDistinctNames.length).toBeGreaterThan(0);
  });
});

describe('normalizeFplFixtures', () => {
  const fixtures = normalizeFplFixtures(fixturesRaw);

  it('reads a complete 380-fixture season', () => {
    expect(fixtures).toHaveLength(380);
  });

  it('covers all 38 gameweeks with ten fixtures each', () => {
    const byRound = new Map<number, number>();
    for (const fixture of fixtures) {
      byRound.set(fixture.roundNumber!, (byRound.get(fixture.roundNumber!) ?? 0) + 1);
    }

    expect(byRound.size).toBe(38);
    for (let round = 1; round <= 38; round += 1) {
      // A short gameweek means a matchweek where some members have nothing to predict.
      expect(byRound.get(round)).toBe(10);
    }
  });

  it('gives every fixture a parseable kickoff', () => {
    for (const fixture of fixtures) {
      expect(fixture.kickoffAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(Number.isNaN(new Date(fixture.kickoffAt).getTime())).toBe(false);
      expect(fixture.homeTeamProviderId).not.toBe(fixture.awayTeamProviderId);
    }
  });

  it('has every club playing every other home and away', () => {
    // 380 fixtures is the right *count* even if the pairings are wrong, so check the
    // structure: 20 clubs, 38 games each, and each ordered pairing exactly once.
    const appearances = new Map<string, number>();
    const pairings = new Set<string>();

    for (const fixture of fixtures) {
      for (const id of [fixture.homeTeamProviderId, fixture.awayTeamProviderId]) {
        appearances.set(id, (appearances.get(id) ?? 0) + 1);
      }
      pairings.add(`${fixture.homeTeamProviderId}v${fixture.awayTeamProviderId}`);
    }

    expect(appearances.size).toBe(20);
    for (const count of appearances.values()) expect(count).toBe(38);
    expect(pairings.size).toBe(380);
  });

  it('starts on the opening weekend and has not been played yet', () => {
    const first = fixtures.reduce((a, b) => (a.kickoffAt < b.kickoffAt ? a : b));
    expect(first.roundNumber).toBe(1);
    expect(first.status).toBe('scheduled');
    // The season the app is being built for.
    expect(first.kickoffAt.startsWith('2026-08')).toBe(true);
  });

  it('drops undated fixtures rather than inventing a deadline', () => {
    const raw = fixturesRaw as { event: number | null; kickoff_time: string | null }[];
    const undated = raw.filter((f) => f.event == null || f.kickoff_time == null).length;
    // A market whose locks_at is unknown cannot be enforced by the lock trigger, so an
    // undated fixture must not become one.
    expect(fixtures.length).toBe(raw.length - undated);
  });
});
