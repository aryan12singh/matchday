/**
 * When to poll the provider, and how hard.
 *
 * Pure decision logic, separated from the tick so it can be tested against a clock without
 * a database or a provider. This is the piece that decides whether a season costs a few
 * hundred requests or tens of thousands.
 *
 * The shape of a football week is the whole argument. Nothing happens for days, then five
 * matches kick off simultaneously and every minute matters for two hours. A fixed poll
 * interval is wrong in both directions at once: too slow at 3pm on Saturday, and pure waste
 * at 4am on Tuesday. So the tick asks this module what is worth doing *right now*, and on a
 * quiet day the answer is "nothing", which costs one cheap SQL call and no quota at all.
 */

export type SyncAction = 'live' | 'final' | 'corrections' | 'fixtures' | 'reference';

export interface FixtureWindowInput {
  /** Kickoffs of fixtures that are not yet settled, as epoch milliseconds. */
  kickoffs: number[];
  /** Any fixture currently in a playing state. */
  hasInPlay: boolean;
  /** Fixtures that have ended but have no confirmed result stored yet. */
  hasUnfinalised: boolean;
  /** Fixtures already settled but still inside the correction window. */
  hasRecentlySettled: boolean;
  now: number;
}

export interface WindowPlan {
  actions: SyncAction[];
  /** Human-readable reason, recorded on the sync run so /ops can explain a quiet day. */
  reason: string;
  /** Rough number of provider requests this plan will spend. */
  estimatedRequests: number;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Live polling starts 10 minutes before the first kickoff and continues while anything is
 * in play. The lead is for lineups and a late kickoff change, not for the score.
 */
const PRE_KICKOFF_LEAD = 10 * MINUTE;

/**
 * How long after a kickoff a fixture might still be in play. Ninety minutes plus half time
 * plus stoppage plus a delay; generous on purpose, because the cost of guessing short is a
 * match that stops updating at the 88th minute.
 */
const MATCH_DURATION = 150 * MINUTE;

export function planWindow(input: FixtureWindowInput): WindowPlan {
  const { now, kickoffs } = input;
  const actions: SyncAction[] = [];

  const nextKickoff = kickoffs.filter((k) => k >= now).sort((a, b) => a - b)[0] ?? null;
  const inMatchWindow =
    input.hasInPlay ||
    kickoffs.some((k) => k <= now + PRE_KICKOFF_LEAD && now < k + MATCH_DURATION);

  if (inMatchWindow) {
    actions.push('live');
  }

  // Finalisation has to keep running after the live window closes: a match that overran, or
  // one the live list dropped early, is finalised by this and by nothing else. It is cheap
  // because it only looks at fixtures that have no confirmed result yet.
  if (input.hasUnfinalised || inMatchWindow) {
    actions.push('final');
  }

  // Corrections are a different job wearing the same clothes, and conflating them was a
  // real bug: a settled fixture stays inside the correction window for days, so re-checking
  // it every minute meant re-fetching every recent fixture 1,440 times a day. Providers
  // revise results over hours, not seconds — twice an hour is far more often than needed.
  if (input.hasRecentlySettled && !inMatchWindow && isCorrectionMinute(now)) {
    actions.push('corrections');
  }

  // Schedule drift is slow. Once an hour is far more often than fixtures actually move, and
  // it still catches a reschedule long before its old kickoff arrives — except inside the
  // match window, where the schedule is settled and the requests are needed elsewhere.
  if (!inMatchWindow && isOnTheHour(now)) {
    actions.push('fixtures');
  }

  // The table only changes when matches finish. Refreshing it a few times a day is plenty,
  // and doing it away from the match window keeps matchday requests for the matches.
  if (!inMatchWindow && isDailyRefreshMinute(now)) {
    actions.push('reference');
  }

  return {
    actions,
    reason: describe(inMatchWindow, nextKickoff, now, actions),
    estimatedRequests: estimate(actions, input),
  };
}

/**
 * The tick fires every minute; these gates are how an hourly job lives inside it.
 *
 * Minute-of-hour rather than a stored "last run at", because a missed tick should simply
 * mean the job runs next hour rather than immediately — there is nothing urgent about a
 * fixture list, and a catch-up burst after an outage is exactly when quota is tightest.
 */
function isOnTheHour(now: number): boolean {
  return new Date(now).getUTCMinutes() === 7;
}

/** Twice an hour, offset from the other scheduled minutes so they never bunch. */
function isCorrectionMinute(now: number): boolean {
  const minute = new Date(now).getUTCMinutes();
  return minute === 23 || minute === 53;
}

function isDailyRefreshMinute(now: number): boolean {
  const date = new Date(now);
  // 04:11 UTC — after any European fixture has finished, before anyone is awake to look.
  return date.getUTCHours() === 4 && date.getUTCMinutes() === 11;
}

function describe(
  inMatchWindow: boolean,
  nextKickoff: number | null,
  now: number,
  actions: SyncAction[],
): string {
  if (actions.length === 0) {
    if (nextKickoff == null) return 'idle: no upcoming fixtures';
    const hours = Math.round((nextKickoff - now) / HOUR);
    return `idle: next kickoff in ~${hours}h`;
  }
  if (inMatchWindow) return 'match window: live polling';
  return `scheduled: ${actions.join(', ')}`;
}

/**
 * Cost estimate, used by the tick to stand down when the quota ledger is low.
 *
 * Live is one list call plus one events call per in-play fixture — the number that decides
 * whether a Saturday is affordable. Five concurrent matches is six requests a minute, which
 * is ~720 over a two-hour window: fine on Pro's 7,500/day, and roughly seven times the
 * Free plan's entire daily allowance.
 */
function estimate(actions: SyncAction[], input: FixtureWindowInput): number {
  let total = 0;
  for (const action of actions) {
    if (action === 'live') {
      const concurrent = input.kickoffs.filter(
        (k) => k <= input.now && input.now < k + MATCH_DURATION,
      ).length;
      total += 1 + concurrent;
    }
    if (action === 'final') total += 2;
    if (action === 'corrections') total += 4;
    if (action === 'fixtures') total += 1;
    if (action === 'reference') total += 2;
  }
  return total;
}

export const WINDOW_CONSTANTS = { PRE_KICKOFF_LEAD, MATCH_DURATION } as const;
