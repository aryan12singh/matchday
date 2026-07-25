export interface ScoreStepperProps {
  /** null = unpredicted, renders "–" */
  value: number | null;
  onChange?: (v: number) => void;
  disabled?: boolean;
}