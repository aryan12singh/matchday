export interface StateBadgeProps {
  state: 'live' | 'locked' | 'settled' | 'void' | 'pending';
  /** override label, e.g. "LIVE · 64′" */
  children?: React.ReactNode;
}