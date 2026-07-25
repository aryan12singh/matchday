export interface CountdownChipProps {
  /** e.g. "LOCKS IN" | "VOTING CLOSES" */
  label?: string;
  /** preformatted, e.g. "1d 14:32:08" */
  time: string;
  /** coral treatment when < 1h to lock */
  urgent?: boolean;
}