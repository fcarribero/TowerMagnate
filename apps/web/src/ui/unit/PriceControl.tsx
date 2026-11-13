import { useEffect, useState } from 'preact/hooks';
import { NumberInput } from '../kit';
import { formatMoney } from '../money';
import { t } from '../strings';
import { appraisalPercent, clampPrice, priceBandLabel, type PriceControl } from './unitWindowModel';

export interface PriceControlProps {
  id: string;
  label: string;
  control: PriceControl;
  disabled: boolean;
  /** Called once per change: when a drag ends or a typed price is applied. */
  onCommit: (price: number) => void;
}

/** A bar to raise or lower the price, the appraisal marked on it, and a box to type the price. */
export function PriceControlView({ id, label, control, disabled, onCommit }: PriceControlProps) {
  const { price, appraisal, band, min, max, step } = control;
  const [draft, setDraft] = useState(price);
  useEffect(() => setDraft(price), [price]);

  const commit = (value: number): void => {
    const next = clampPrice(value, min, max, step);
    setDraft(next);
    if (next !== price) {
      onCommit(next);
    }
  };

  const mark = appraisalPercent(appraisal, min, max);
  return (
    <div class="tm-unit__price-control">
      <p class="tm-unit__price-title">{label}</p>
      <div class="tm-unit__price-line">
        <div class="tm-unit__price-bar">
          <input
            type="range"
            aria-label={t('window.unit.priceSlider')}
            min={min}
            max={max}
            step={step}
            value={draft}
            disabled={disabled}
            onInput={(event) => setDraft(Number(event.currentTarget.value))}
            onChange={(event) => commit(Number(event.currentTarget.value))}
          />
          {appraisal > 0 && (
            <span
              class="tm-unit__appraisal-mark"
              style={{ left: `${mark}%` }}
              title={t('window.unit.appraisalMark', { price: formatMoney(appraisal) })}
            />
          )}
        </div>
        <div class="tm-unit__price-input">
          <NumberInput
            id={`${id}-number`}
            label={t('window.unit.priceInput')}
            value={draft}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={commit}
          />
        </div>
      </div>
      <p class="tm-unit__band">{priceBandLabel(band)}</p>
    </div>
  );
}
