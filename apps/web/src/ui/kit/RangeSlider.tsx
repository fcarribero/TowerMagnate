import { useEffect, useState } from 'preact/hooks';

export interface RangeSliderProps {
  id: string;
  /** Accessible names of the two thumbs. */
  lowLabel: string;
  highLabel: string;
  min: number;
  max: number;
  step?: number;
  low: number;
  high: number;
  /** Called on every move, for a live label. */
  onInput?: (low: number, high: number) => void;
  /** Called when a thumb is let go or a key press settles. */
  onChange: (low: number, high: number) => void;
  /** Keeps `high` above `low` after the thumb `moved`; returns the pair to use. */
  constrain?: (low: number, high: number, moved: 'low' | 'high') => { low: number; high: number };
  disabled?: boolean;
}

function keepApart(
  low: number,
  high: number,
  moved: 'low' | 'high',
  step: number,
): { low: number; high: number } {
  if (low < high) {
    return { low, high };
  }
  return moved === 'low' ? { low: high - step, high } : { low, high: low + step };
}

/**
 * Two native range inputs on one track, drawn like the volume slider: the low thumb and the high
 * thumb cannot cross. Dragging only moves the local values; `onChange` fires when a thumb is let go.
 */
export function RangeSlider({
  id,
  lowLabel,
  highLabel,
  min,
  max,
  step = 1,
  low,
  high,
  onInput,
  onChange,
  constrain,
  disabled = false,
}: RangeSliderProps) {
  const [pair, setPair] = useState({ low, high });
  useEffect(() => setPair({ low, high }), [low, high]);

  const move = (value: number, moved: 'low' | 'high'): { low: number; high: number } => {
    const raw = moved === 'low' ? { low: value, high: pair.high } : { low: pair.low, high: value };
    return constrain === undefined
      ? keepApart(raw.low, raw.high, moved, step)
      : constrain(raw.low, raw.high, moved);
  };

  const input = (moved: 'low' | 'high') => (event: Event) => {
    const next = move(Number((event.currentTarget as HTMLInputElement).value), moved);
    setPair(next);
    onInput?.(next.low, next.high);
  };

  const settle = (moved: 'low' | 'high') => (event: Event) => {
    const next = move(Number((event.currentTarget as HTMLInputElement).value), moved);
    setPair(next);
    if (next.low !== low || next.high !== high) {
      onChange(next.low, next.high);
    }
  };

  const span = Math.max(1, max - min);
  const from = ((pair.low - min) / span) * 100;
  const to = ((pair.high - min) / span) * 100;

  return (
    <div class="tm-range" id={id}>
      <div class="tm-range__track" aria-hidden="true">
        <div class="tm-range__fill" style={{ left: `${from}%`, width: `${to - from}%` }} />
      </div>
      <input
        type="range"
        class="tm-range__input"
        aria-label={lowLabel}
        min={min}
        max={max}
        step={step}
        value={pair.low}
        disabled={disabled}
        onInput={input('low')}
        onChange={settle('low')}
      />
      <input
        type="range"
        class="tm-range__input"
        aria-label={highLabel}
        min={min}
        max={max}
        step={step}
        value={pair.high}
        disabled={disabled}
        onInput={input('high')}
        onChange={settle('high')}
      />
    </div>
  );
}
