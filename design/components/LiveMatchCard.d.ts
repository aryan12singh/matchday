export interface LiveMatchCardProps {
  home: string; away: string;
  homeScore: number; awayScore: number;
  /** match minute, e.g. "64" or "45+2" */
  minute: string;
  /** e.g. "2:1" */
  myPick?: string;
  /** live provisional points for this match */
  provisionalPts?: number;
  /** exact-score currently correct */
  onTrack?: boolean;
  onClick?: () => void;
}