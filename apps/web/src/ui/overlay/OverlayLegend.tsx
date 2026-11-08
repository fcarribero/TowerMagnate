import type { OverlayId } from '../../render/overlayColors';
import { t, type StringKey } from '../strings';
import { legendOf } from './overlayModel';
import './overlay.css';

export function OverlayLegend({ overlay }: { overlay: OverlayId }) {
  const entries = legendOf(overlay);
  if (entries.length === 0) {
    return null;
  }
  return (
    <div class="overlay-legend">
      <div class="overlay-legend__title">{t(`overlay.${overlay}` as StringKey)}</div>
      {entries.map((item) => (
        <div key={item.label} class="overlay-legend__row">
          <span class="overlay-legend__swatch" style={{ background: item.hex }} />
          {t(item.label)}
        </div>
      ))}
    </div>
  );
}
