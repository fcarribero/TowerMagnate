import { ObraIcon } from '../icons/ObraIcon';
import { t } from '../strings';
import { GAME_SPEEDS } from './developerSettings';
import './speedControls.css';

export interface SpeedControlsProps {
  /** The speed the tower runs at, or would run at when not paused. */
  speed: number;
  paused: boolean;
  onPick: (speed: number) => void;
  onTogglePause: () => void;
}

/** Developer controls under the clock: pause and the game speeds. Keys: Space and 1 to 5. */
export function SpeedControls({ speed, paused, onPick, onTogglePause }: SpeedControlsProps) {
  return (
    <div class="speed-controls" role="group" aria-label={t('ui.dev.gameSpeed')}>
      <button
        type="button"
        class={paused ? 'speed-controls__button is-active' : 'speed-controls__button'}
        aria-label={t('ui.dev.pause')}
        aria-pressed={paused}
        title={`${t('ui.dev.pause')} (Espacio)`}
        onClick={onTogglePause}
      >
        <ObraIcon name="pause" class="speed-controls__icon" />
      </button>
      {GAME_SPEEDS.map((candidate, index) => {
        const active = !paused && candidate === speed;
        return (
          <button
            key={candidate}
            type="button"
            class={active ? 'speed-controls__button is-active' : 'speed-controls__button'}
            aria-pressed={active}
            title={`${candidate}x (${index + 1})`}
            onClick={() => onPick(candidate)}
          >
            {candidate}x
          </button>
        );
      })}
    </div>
  );
}
