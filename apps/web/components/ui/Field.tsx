import type { InputHTMLAttributes } from 'react';

/**
 * Labelled text input. Not in the design bundle's component list, but every form in the
 * product needs one, so it is built from the same tokens: uppercase Archivo label,
 * 44px target, volt focus ring, and an error that is announced rather than only coloured.
 */
export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  /** Shown under the field and linked with aria-describedby. */
  error?: string | null;
  hint?: string;
  /** Extra input classes — token classes only, never raw colour. */
  inputClassName?: string;
}

export function Field({ label, error, hint, id, inputClassName = '', ...props }: FieldProps) {
  const inputId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, '-');
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="label">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
        className={[
          'min-h-tap rounded-md bg-surface-2 px-4 text-text',
          'shadow-el-1 placeholder:text-text-3',
          // State is never colour alone: an invalid field also gets aria-invalid and a
          // text message below.
          error ? 'outline outline-1 outline-danger' : '',
          inputClassName,
        ].join(' ')}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-[12.5px] text-text-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
