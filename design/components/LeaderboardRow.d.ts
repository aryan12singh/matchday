export interface LeaderboardRowProps {
  rank: number;
  name: string;
  /** 2-letter initials */
  avatar: string;
  points: number;
  /** vs last matchweek: + up, − down, 0 flat */
  movement?: number;
  isMe?: boolean;
  /** per-category points, e.g. { outcome: 34, exact: 21, gd: 12, ... } */
  breakdown?: Record<string, number | string>;
  /** e.g. "+£15" — only when league prize scheme active */
  prize?: string;
  expanded?: boolean;
  onToggle?: () => void;
  /** deciding tiebreak text when points tied */
  tiebreak?: string;
}