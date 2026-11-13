import { t } from '../strings';
import { GAME_SPEEDS, type DeveloperSettings } from './developerSettings';

export interface DeveloperPanelProps {
  settings: DeveloperSettings;
  onChange: (next: DeveloperSettings) => void;
}

/** The entries under Debug: a checkbox for infinite money and a slider for the game speed. */
export function DeveloperPanel({ settings, onChange }: DeveloperPanelProps) {
  const speedIndex = Math.max(GAME_SPEEDS.indexOf(settings.speed as (typeof GAME_SPEEDS)[number]), 0);
  return (
    <>
      <label class="game-menu-volume game-menu-check">
        <input
          type="checkbox"
          checked={settings.infiniteMoney}
          onChange={(event) =>
            onChange({ ...settings, infiniteMoney: (event.currentTarget as HTMLInputElement).checked })
          }
        />
        {t('ui.dev.infiniteMoney')}
      </label>
      <label class="game-menu-volume">
        {t('ui.dev.gameSpeed')}
        <input
          type="range"
          min={0}
          max={GAME_SPEEDS.length - 1}
          step={1}
          value={speedIndex}
          onInput={(event) => {
            const index = Number((event.currentTarget as HTMLInputElement).value);
            onChange({ ...settings, speed: GAME_SPEEDS[index] ?? 1 });
          }}
        />
        <span>{settings.speed}x</span>
      </label>
    </>
  );
}
