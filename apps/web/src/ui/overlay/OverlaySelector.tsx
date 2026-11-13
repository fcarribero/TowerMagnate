import { OVERLAY_IDS } from './overlayModel';
import type { OverlayId } from '../../render/overlayColors';
import { t, type StringKey } from '../strings';
import './overlay.css';

export interface OverlaySelectorProps {
  overlay: OverlayId;
  onSelect: (overlay: OverlayId) => void;
}

export function OverlaySelector({ overlay, onSelect }: OverlaySelectorProps) {
  return (
    <div class="overlay-selector" role="group" aria-label={t('overlay.name')}>
      {OVERLAY_IDS.map((id) => (
        <button
          key={id}
          type="button"
          class={id === overlay ? 'overlay-selector__button is-on' : 'overlay-selector__button'}
          aria-pressed={id === overlay}
          aria-label={t(`overlay.${id}` as StringKey)}
          title={t(`overlay.${id}` as StringKey)}
          onClick={() => onSelect(id)}
        >
          {t(`overlay.${id}` as StringKey)}
        </button>
      ))}
    </div>
  );
}
