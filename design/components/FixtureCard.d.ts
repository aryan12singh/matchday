export interface FixtureCardProps {
  home: { code: string; name: string };
  away: { code: string; name: string };
  /** localized, e.g. "Sat 16:30" */
  kickoff: string;
  state?: 'editable' | 'locked' | 'live' | 'settled' | 'void';
  /** my prediction; null = unpredicted */
  homeScore: number | null;
  awayScore: number | null;
  /** real score when live/settled */
  actualHome?: number;
  actualAway?: number;
  minute?: string;
  /** provisional (live) or final (settled) points */
  points?: number;
  /** league names this fixture counts in (selection leagues) */
  countsIn?: string[];
  notIn?: string[];
  /** autosave tick */
  saved?: boolean;
  onScore?: (side: 'home' | 'away', delta: 1 | -1) => void;
  onExpand?: () => void;
}