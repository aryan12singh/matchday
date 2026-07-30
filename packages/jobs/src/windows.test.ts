import { describe, expect, it } from 'vitest';

import { resultHash } from './sync-final';
import { planWindow } from './windows';

/**
 * Windowing decides the entire provider bill, so the cases that matter are the expensive
 * ones and the free ones — not the average.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** A Tuesday at 04:00 UTC, deliberately not on any of the scheduled minutes. */
const QUIET = Date.UTC(2026, 7, 25, 4, 30, 0);

describe('planWindow', () => {
  it('does nothing, and spends nothing, on a day with no football', () => {
    const plan = planWindow({ now: QUIET, kickoffs: [], hasInPlay: false, hasUnfinalised: false, hasRecentlySettled: false });

    expect(plan.actions).toEqual([]);
    expect(plan.estimatedRequests).toBe(0);
    expect(plan.reason).toContain('idle');
  });

  it('stays idle the day before a match rather than polling towards it', () => {
    const plan = planWindow({
      now: QUIET,
      kickoffs: [QUIET + 26 * HOUR],
      hasInPlay: false,
      hasUnfinalised: false, hasRecentlySettled: false,
    });

    expect(plan.actions).toEqual([]);
    expect(plan.reason).toMatch(/next kickoff in ~26h/);
  });

  it('wakes up shortly before kickoff', () => {
    const kickoff = QUIET + 5 * MINUTE;
    const plan = planWindow({
      now: QUIET,
      kickoffs: [kickoff],
      hasInPlay: false,
      hasUnfinalised: false, hasRecentlySettled: false,
    });

    expect(plan.actions).toContain('live');
  });

  it('keeps polling a match in progress', () => {
    const plan = planWindow({
      now: QUIET,
      kickoffs: [QUIET - 40 * MINUTE],
      hasInPlay: true,
      hasUnfinalised: false, hasRecentlySettled: false,
    });

    expect(plan.actions).toContain('live');
    expect(plan.actions).toContain('final');
  });

  it('stops polling once the match window has fully passed', () => {
    // Three hours after kickoff: beyond even a heavily delayed match.
    const plan = planWindow({
      now: QUIET,
      kickoffs: [QUIET - 3 * HOUR],
      hasInPlay: false,
      hasUnfinalised: false, hasRecentlySettled: false,
    });

    expect(plan.actions).not.toContain('live');
  });

  it('keeps finalising after the live window, since that is the only thing that ends a match', () => {
    const plan = planWindow({
      now: QUIET,
      kickoffs: [QUIET - 3 * HOUR],
      hasInPlay: false,
      hasUnfinalised: true, hasRecentlySettled: false,
    });

    expect(plan.actions).toContain('final');
  });

  it('prices a five-match Saturday honestly', () => {
    // Five concurrent 3pm kickoffs, thirty minutes in.
    const kickoff = QUIET - 30 * MINUTE;
    const plan = planWindow({
      now: QUIET,
      kickoffs: [kickoff, kickoff, kickoff, kickoff, kickoff],
      hasInPlay: true,
      hasUnfinalised: false, hasRecentlySettled: false,
    });

    // One live list + one events call per match, plus the finalisation probe.
    expect(plan.estimatedRequests).toBe(1 + 5 + 2);

    // Which, sustained for a two-hour window, is why the Free plan cannot do this:
    const perMatchday = plan.estimatedRequests * 120;
    expect(perMatchday).toBeGreaterThan(100);
  });

  it('does not run schedule or table syncs during a match window', () => {
    // The scheduled minute for the fixture sync, but a match is in play.
    const onTheHour = Date.UTC(2026, 7, 22, 15, 7, 0);
    const plan = planWindow({
      now: onTheHour,
      kickoffs: [onTheHour - 20 * MINUTE],
      hasInPlay: true,
      hasUnfinalised: false, hasRecentlySettled: false,
    });

    expect(plan.actions).not.toContain('fixtures');
    expect(plan.actions).not.toContain('reference');
  });

  it('runs the fixture sync hourly when nothing is on', () => {
    const onTheHour = Date.UTC(2026, 7, 25, 9, 7, 0);
    const plan = planWindow({
      now: onTheHour,
      kickoffs: [],
      hasInPlay: false,
      hasUnfinalised: false, hasRecentlySettled: false,
    });

    expect(plan.actions).toEqual(['fixtures']);
    expect(plan.estimatedRequests).toBe(1);
  });

  it('refreshes the table once a day, overnight', () => {
    const overnight = Date.UTC(2026, 7, 25, 4, 11, 0);
    const plan = planWindow({
      now: overnight,
      kickoffs: [],
      hasInPlay: false,
      hasUnfinalised: false, hasRecentlySettled: false,
    });

    expect(plan.actions).toContain('reference');
  });

  it('spends nothing on the other 1,438 minutes of a quiet day', () => {
    let spent = 0;
    const midnight = Date.UTC(2026, 7, 25, 0, 0, 0);

    for (let minute = 0; minute < 1440; minute += 1) {
      spent += planWindow({
        now: midnight + minute * MINUTE,
        kickoffs: [],
        hasInPlay: false,
        hasUnfinalised: false, hasRecentlySettled: false,
      }).estimatedRequests;
    }

    // 24 hourly fixture syncs + one daily reference refresh. A whole football-free day
    // costs 26 requests, which is what makes the Free plan survivable out of season.
    expect(spent).toBe(24 * 1 + 2);
  });
});

describe('resultHash', () => {
  const fixture = { status: 'finished' as const, homeScore: 2, awayScore: 1, htHome: 1, htAway: 0 };
  const goal = (
    minute: number,
    player: string,
    type: 'goal' | 'own_goal' | 'penalty_goal' | 'yellow' = 'goal',
  ) => ({
    providerEventKey: `k${minute}`,
    fixtureProviderId: 'f1',
    type,
    minute,
    addedMinute: null,
    teamProviderId: 't1',
    playerProviderId: player,
    assistPlayerProviderId: null,
  });

  it('is stable across identical inputs', () => {
    const events = [goal(10, 'p1'), goal(70, 'p2')];
    expect(resultHash(fixture, events)).toBe(resultHash(fixture, events));
  });

  it('ignores the order events arrive in', () => {
    const a = resultHash(fixture, [goal(10, 'p1'), goal(70, 'p2')]);
    const b = resultHash(fixture, [goal(70, 'p2'), goal(10, 'p1')]);
    expect(a).toBe(b);
  });

  it('changes when a goal is reassigned to another player', () => {
    // The case the whole correction path exists for: same 2-1, different first scorer.
    const before = resultHash(fixture, [goal(10, 'p1'), goal(70, 'p2')]);
    const after = resultHash(fixture, [goal(10, 'p9'), goal(70, 'p2')]);
    expect(after).not.toBe(before);
  });

  it('changes when a goal is recategorised as an own goal', () => {
    const before = resultHash(fixture, [goal(10, 'p1')]);
    const after = resultHash(fixture, [goal(10, 'p1', 'own_goal')]);
    expect(after).not.toBe(before);
  });

  it('changes when the scoreline is corrected', () => {
    const before = resultHash(fixture, [goal(10, 'p1')]);
    const after = resultHash({ ...fixture, awayScore: 2 }, [goal(10, 'p1')]);
    expect(after).not.toBe(before);
  });

  it('does not change when a booking is added after the whistle', () => {
    // Disciplinary tidy-ups happen for days. Re-settling the league every time one lands
    // would be pure churn, so only goal events are in the fingerprint.
    const goalsOnly = [goal(10, 'p1')];
    const withCard = [
      goal(10, 'p1'),
      { ...goal(80, 'p5', 'yellow'), providerEventKey: 'card' },
    ];
    expect(resultHash(fixture, withCard)).toBe(resultHash(fixture, goalsOnly));
  });
});
