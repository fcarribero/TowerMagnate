import { useEffect, useState } from 'preact/hooks';
import { t } from '../strings';

export interface NumberInputProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
}

export function clampToStep(value: number, min: number, max: number, step: number): number {
  const stepped = min + Math.round((value - min) / step) * step;
  return Math.min(Math.max(stepped, min), max);
}

/**
 * A whole-number field with up and down buttons. Typing is kept as a draft and
 * applied on Enter or when the field loses focus; Esc drops the draft.
 */
export function NumberInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
}: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const apply = (next: number): void => {
    const clamped = clampToStep(next, min, max, step);
    setDraft(String(clamped));
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  const applyDraft = (): void => {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
    } else {
      apply(parsed);
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      apply(value + step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      apply(value - step);
    } else if (event.key === 'Enter') {
      applyDraft();
    } else if (event.key === 'Escape') {
      setDraft(String(value));
    }
  };

  return (
    <div class="tm-number">
      <label class="tm-number__label" for={id}>
        {label}
      </label>
      <div class="tm-number__field">
        <input
          id={id}
          class="tm-input"
          type="text"
          inputMode="numeric"
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          value={draft}
          disabled={disabled}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onBlur={applyDraft}
          onKeyDown={onKeyDown}
        />
        <div class="tm-number__arrows">
          <button
            type="button"
            class="tm-number__arrow"
            tabIndex={-1}
            aria-label={t('ui.increase')}
            disabled={disabled || value >= max}
            onClick={() => apply(value + step)}
          >
            ▲
          </button>
          <button
            type="button"
            class="tm-number__arrow"
            tabIndex={-1}
            aria-label={t('ui.decrease')}
            disabled={disabled || value <= min}
            onClick={() => apply(value - step)}
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}
