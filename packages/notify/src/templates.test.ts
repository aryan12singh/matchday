import { describe, expect, it } from 'vitest';

import { deadlineDedupeKey, deadlineReminder } from './templates';

describe('deadlineReminder', () => {
  it('says what is missing and how long is left', () => {
    const message = deadlineReminder({ unpredicted: 3, matchweekNumber: 7, minutesToLock: 60 });

    expect(message.title).toContain('Matchweek 7');
    expect(message.title).toContain('1 hour');
    expect(message.body).toContain('3 matches');
    expect(message.url).toBe('/predict');
  });

  it('gets the singular right', () => {
    // "1 matches" is the kind of detail that makes an app feel unfinished.
    const message = deadlineReminder({ unpredicted: 1, matchweekNumber: 2, minutesToLock: 30 });
    expect(message.body).toContain('one match');
    expect(message.body).not.toContain('1 matches');
  });

  it('switches from minutes to hours at the point where minutes stop being readable', () => {
    expect(
      deadlineReminder({ unpredicted: 1, matchweekNumber: 1, minutesToLock: 45 }).title,
    ).toContain('45 minutes');
    expect(
      deadlineReminder({ unpredicted: 1, matchweekNumber: 1, minutesToLock: 180 }).title,
    ).toContain('3 hours');
  });

  it('never announces zero minutes', () => {
    // A reminder that fires a few seconds late must not say "locks in 0 minutes".
    const message = deadlineReminder({ unpredicted: 2, matchweekNumber: 1, minutesToLock: 0.2 });
    expect(message.title).toContain('1 minute');
    expect(message.title).not.toContain('0 minute');
  });

  it('pluralises both units correctly', () => {
    expect(
      deadlineReminder({ unpredicted: 1, matchweekNumber: 1, minutesToLock: 120 }).title,
    ).toContain('2 hours');
    expect(
      deadlineReminder({ unpredicted: 1, matchweekNumber: 1, minutesToLock: 2 }).title,
    ).toContain('2 minutes');
  });

  it('tags per matchweek so a later reminder replaces the earlier one', () => {
    const first = deadlineReminder({ unpredicted: 5, matchweekNumber: 3, minutesToLock: 240 });
    const second = deadlineReminder({ unpredicted: 2, matchweekNumber: 3, minutesToLock: 30 });
    // Same tag: the lock screen shows one current notification, not a pile.
    expect(first.tag).toBe(second.tag);

    const other = deadlineReminder({ unpredicted: 2, matchweekNumber: 4, minutesToLock: 30 });
    expect(other.tag).not.toBe(first.tag);
  });
});

describe('deadlineDedupeKey', () => {
  it('is stable across retries of the same reminder', () => {
    // notification_log.dedupe_key is unique, so this is what stops a retried job buzzing
    // someone a second time. A timestamp in here would make every attempt look new.
    const a = deadlineDedupeKey('user-1', 'round-1', 60);
    const b = deadlineDedupeKey('user-1', 'round-1', 60);
    expect(a).toBe(b);
  });

  it('separates users, matchweeks and lead times', () => {
    const base = deadlineDedupeKey('user-1', 'round-1', 60);
    expect(deadlineDedupeKey('user-2', 'round-1', 60)).not.toBe(base);
    expect(deadlineDedupeKey('user-1', 'round-2', 60)).not.toBe(base);
    // Someone with both a day-before and an hour-before reminder gets both.
    expect(deadlineDedupeKey('user-1', 'round-1', 1440)).not.toBe(base);
  });
});
