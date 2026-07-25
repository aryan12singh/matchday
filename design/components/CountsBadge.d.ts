export interface CountsBadgeProps {
  /** league short name, e.g. "BOOT ROOM" */
  league: string;
  /** false → muted "not selected in this league" */
  counts?: boolean;
}