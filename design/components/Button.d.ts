export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  children: React.ReactNode;
  disabled?: boolean;
  full?: boolean;
  onClick?: () => void;
}