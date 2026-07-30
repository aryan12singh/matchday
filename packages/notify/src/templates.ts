import type { PushMessage } from './push';

/**
 * Notification copy.
 *
 * Separate from delivery so the wording can be tested without a push service, and so the
 * same message can go out over a second channel later without being rewritten.
 *
 * The tone follows design/README.md: plain, specific, never nagging. A reminder that says
 * what is missing and how long is left respects someone who has already decided not to
 * play; one that says "Don't miss out!" does not.
 */

export const DEADLINE_REMINDER = 'deadline_reminder';

export interface DeadlineReminderInput {
  /** How many fixtures in this matchweek the user has not answered. */
  unpredicted: number;
  matchweekNumber: number;
  /** Minutes until the first of those fixtures locks. */
  minutesToLock: number;
}

export function deadlineReminder(input: DeadlineReminderInput): PushMessage {
  const { unpredicted, matchweekNumber, minutesToLock } = input;

  // Hours from an hour out, and both units pluralise properly: "1 hours" and "1 minutes"
  // are exactly the sort of detail that makes an app feel unfinished.
  const when = (() => {
    if (minutesToLock >= 60) {
      const hours = Math.round(minutesToLock / 60);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    const minutes = Math.max(1, Math.round(minutesToLock));
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  })();

  // Singular and plural read very differently when the number is 1, and "1 matches" is the
  // kind of detail that makes an app feel unfinished.
  const what = unpredicted === 1 ? 'one match' : `${unpredicted} matches`;

  return {
    title: `Matchweek ${matchweekNumber} locks in ${when}`,
    body: `You have ${what} still to predict.`,
    url: '/predict',
    // Tagged per matchweek so a second reminder replaces the first rather than stacking
    // two near-identical notifications on the lock screen.
    tag: `${DEADLINE_REMINDER}:mw${matchweekNumber}`,
  };
}

/**
 * A stable key for one reminder to one person.
 *
 * notification_log.dedupe_key is unique, so this is what makes a retried job — or two
 * overlapping ticks — a no-op instead of a second buzz. Keyed on the matchweek and the
 * lead time rather than the moment of sending: the same reminder must be recognisable
 * across retries, and a timestamp would make every attempt look new.
 */
export function deadlineDedupeKey(
  userId: string,
  roundId: string,
  leadMinutes: number,
): string {
  return `${DEADLINE_REMINDER}:${userId}:${roundId}:${leadMinutes}`;
}
