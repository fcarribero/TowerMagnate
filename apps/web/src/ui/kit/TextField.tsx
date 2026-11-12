export interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Called with the current value when the field loses focus. */
  onBlur?: (value: string) => void;
  /** Called with the current value on Enter. Enter then does not submit a parent form. */
  onEnter?: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: 'text' | 'password';
  hint?: string;
  error?: string;
  disabled?: boolean;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  onEnter,
  placeholder,
  maxLength,
  type = 'text',
  hint,
  error,
  disabled = false,
}: TextFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div class="tm-field">
      <label class="tm-field__label" for={id}>
        {label}
      </label>
      <input
        id={id}
        class="tm-input"
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy}
        onInput={(event) => onChange(event.currentTarget.value)}
        onBlur={onBlur && ((event) => onBlur(event.currentTarget.value))}
        onKeyDown={
          onEnter &&
          ((event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onEnter(event.currentTarget.value);
            }
          })
        }
      />
      {hint !== undefined && (
        <p id={hintId} class="tm-field__hint">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} class="tm-field__error">
          {error}
        </p>
      )}
    </div>
  );
}
