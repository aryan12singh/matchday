export interface PrizeTagProps {
  /** preformatted, e.g. "£120" or "+£15" */
  amount: string;
  label?: string;
  /** true when league has no prize scheme — renders nothing */
  hidden?: boolean;
}