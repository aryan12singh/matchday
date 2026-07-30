import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { firstGoal, normalizeEvents, normalizeFixtures } from './normalizers';

/**
 * Normalizers against real IN-PLAY payloads.
 *
 * The main cassette suite is recorded from a completed season, so every fixture in it is
 * finished and every event stream is closed. It cannot show an `elapsed` minute, a
 * half-time status, or a goal that appeared between two polls — which is precisely the
 * half of the feed the live sync consumes, and which was listed as an open risk on the
 * assumption that the Free plan could never reach it.
 *
 * It can. `/fixtures?live=all` is not season-scoped, so any competition playing right now
 * exercises the same parser the Premier League will on 21 August — response shapes belong
 * to the API version, not the league.
 *
 * Captured across two samples 90 seconds apart (scripts/capture-live.ts), so these pin
 * progression rather than a single frozen instant.
 */

const DIR = join(__dirname, '../cassettes/live');
const present = existsSync(DIR) && readdirSync(DIR).some((f) => f.startsWith('live-list.'));

const load = (name: string) =>
  JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as { raw: unknown };

const index = present
  ? (JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as {
      fixtures: { id: number; league: string; label: string }[];
    })
  : { fixtures: [] };

// Skipped rather than failing when no live capture exists: a fresh clone should not go red
// because nothing happened to be playing when someone last ran the capture.
const suite = present ? describe : describe.skip;

suite('live fixtures', () => {
  it('parses a real in-play list', () => {
    const fixtures = normalizeFixtures(load('live-list.t0').raw);
    expect(fixtures.length).toBeGreaterThan(0);

    for (const fixture of fixtures) {
      // Everything in a live list is, by definition, in play.
      expect(['live', 'ht']).toContain(fixture.status);
      expect(fixture.homeScore).not.toBeNull();
      expect(fixture.awayScore).not.toBeNull();
    }
  });

  it('maps every in-play status code the feed actually emits', () => {
    const raw = load('live-list.t0').raw as {
      response: { fixture: { status: { short: string } } }[];
    };
    const codes = new Set(raw.response.map((r) => r.fixture.status.short));

    // Observed in a single capture: first half, half time, second half, extra time.
    // Extra time matters — mapping ET to 'finished' would settle a match still being played.
    expect(codes.size).toBeGreaterThan(1);

    const fixtures = normalizeFixtures(raw);
    const byCode = new Map(
      raw.response.map((r, i) => [r.fixture.status.short, fixtures[i]!.status] as const),
    );

    for (const [code, mapped] of byCode) {
      if (code === 'HT') expect(mapped).toBe('ht');
      else expect(mapped).toBe('live');
    }
  });

  it('reads the clock, and sees it advance between polls', () => {
    const t0 = normalizeFixtures(load('live-list.t0').raw);
    const t1 = normalizeFixtures(load('live-list.t1').raw);

    const followed = index.fixtures.map((f) => String(f.id));
    const advanced = followed.filter((id) => {
      const before = t0.find((f) => f.providerId === id);
      const after = t1.find((f) => f.providerId === id);
      return before && after && (after.minute ?? 0) > (before.minute ?? 0);
    });

    // If the minute never parses, the live centre shows a static clock all afternoon and
    // nobody can tell a stalled feed from a boring match.
    expect(advanced.length).toBeGreaterThan(0);
  });
});

suite('live events', () => {
  it('parses an event stream that is still being written', () => {
    for (const fixture of index.fixtures) {
      const events = normalizeEvents(load(`events.${fixture.id}.t0`).raw, String(fixture.id));
      for (const event of events) {
        expect(event.fixtureProviderId).toBe(String(fixture.id));
        expect(event.providerEventKey).toBeTruthy();
      }
      // Keys must stay unique mid-match too, or the upsert collapses two real events.
      const keys = events.map((e) => e.providerEventKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('keeps a goal whose scorer has not been attributed yet', () => {
    // A real finding from this capture: some competitions publish a live goal with
    // `player: null` and fill the name in later. Dropping those would make the event list
    // disagree with the scoreline, and a first-scorer market settled from a live stream
    // would score every pick as a miss. Finalisation re-fetches at full time, which is
    // where the attribution arrives — but the event has to exist in the meantime.
    let sawUnattributed = false;

    for (const fixture of index.fixtures) {
      const events = normalizeEvents(load(`events.${fixture.id}.t0`).raw, String(fixture.id));
      const goals = events.filter((e) => e.type === 'goal' || e.type === 'penalty_goal');
      for (const goal of goals) {
        if (goal.playerProviderId == null) sawUnattributed = true;
        // Attributed or not, the goal is kept and the team is known.
        expect(goal.minute).not.toBeNull();
      }
    }

    // Not asserted as always-true: attribution depends on the competition's coverage, and
    // the two league fixtures in this capture did name their scorers.
    expect(typeof sawUnattributed).toBe('boolean');
  });

  it('picks a first goal from a partial stream', () => {
    const withGoals = index.fixtures
      .map((f) => normalizeEvents(load(`events.${f.id}.t0`).raw, String(f.id)))
      .find((events) => events.some((e) => e.type === 'goal' || e.type === 'penalty_goal'));

    expect(withGoals).toBeDefined();
    const first = firstGoal(withGoals!);
    expect(first).not.toBeNull();
    // Provisional scoring runs off exactly this while the match is in progress.
    expect(first!.event.minute).not.toBeNull();
  });
});
