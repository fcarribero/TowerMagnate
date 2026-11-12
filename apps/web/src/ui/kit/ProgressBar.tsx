export interface ProgressBarProps {
  id: string;
  label: string;
  /** From 0 to max. */
  value: number;
  max?: number;
  /** Text under the bar, for example "3 de 5". */
  valueText?: string;
}

export function ProgressBar({ id, label, value, max = 100, valueText }: ProgressBarProps) {
  const fraction = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <div class="tm-progress">
      <span id={`${id}-label`} class="tm-progress__label">
        {label}
      </span>
      <div
        id={id}
        class="tm-progress__bar"
        role="progressbar"
        aria-labelledby={`${id}-label`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={fraction * max}
        aria-valuetext={valueText}
      >
        <div class="tm-progress__fill" style={{ width: `${fraction * 100}%` }} />
      </div>
      {valueText !== undefined && <span class="tm-progress__value">{valueText}</span>}
    </div>
  );
}
