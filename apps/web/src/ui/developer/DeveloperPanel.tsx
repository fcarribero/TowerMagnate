import { t } from '../strings';
import type { DeveloperSettings } from './developerSettings';

export interface DeveloperPanelProps {
  settings: DeveloperSettings;
  onChange: (next: DeveloperSettings) => void;
}

/** The entries under Debug: a checkbox for infinite money. The game speed is on the status bar. */
export function DeveloperPanel({ settings, onChange }: DeveloperPanelProps) {
  return (
    <>
      <label class="game-menu-volume game-menu-check">
        <input
          type="checkbox"
          checked={settings.infiniteMoney}
          onChange={(event) =>
            onChange({
              ...settings,
              infiniteMoney: (event.currentTarget as HTMLInputElement).checked,
            })
          }
        />
        {t('ui.dev.infiniteMoney')}
      </label>
    </>
  );
}
