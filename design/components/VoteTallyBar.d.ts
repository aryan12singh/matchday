export interface VoteTallyBarProps {
  /** votes for this fixture */
  votes: number;
  /** league member count (bar denominator) */
  max: number;
  /** current user voted for it */
  mine?: boolean;
  onToggle?: () => void;
  /** after finalization */
  disabled?: boolean;
}