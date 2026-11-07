export interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
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
        disabled={disabled}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy}
        onInput={(event) => onChange(event.currentTarget.value)}
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
