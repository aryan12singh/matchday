/**
 * The notification types a user can toggle.
 *
 * Kept out of the profile server-actions module on purpose: a `'use server'` file may only
 * export async functions, and exporting this constant from there made Next reject the
 * whole module the moment any action in it was invoked — taking profile updates, calendar
 * token rotation and account deletion down with it. Nothing caught that until an action
 * was actually submitted, because merely rendering the page never loads the module as an
 * action boundary.
 */
export const NOTIFICATION_TYPES = [
  'deadline_reminder',
  'lineups_posted',
  'results_and_points',
  'rank_change',
  'recap_ready',
  'voting_open',
  'selection_finalized',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
