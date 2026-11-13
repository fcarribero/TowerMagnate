import { useEffect, useState } from 'preact/hooks';
import type { MenuItem } from '../menu/GameMenu';
import { t } from '../strings';

export const GAME_SPEEDS = [1, 2, 5, 10, 20] as const;

export interface DeveloperSettings {
  infiniteMoney: boolean;
  speed: number;
}

const STORAGE_KEY = 'tm.developer';
const DEFAULTS: DeveloperSettings = { infiniteMoney: false, speed: 1 };

function load(): DeveloperSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return DEFAULTS;
    }
    const parsed = JSON.parse(raw) as Partial<DeveloperSettings>;
    const speed = GAME_SPEEDS.find((candidate) => candidate === parsed.speed) ?? DEFAULTS.speed;
    return { infiniteMoney: parsed.infiniteMoney === true, speed };
  } catch {
    return DEFAULTS;
  }
}

function save(settings: DeveloperSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The settings just are not remembered.
  }
}

/** The menu entries for infinite money and game speed; empty for accounts that are not developers. */
export function developerMenuItems(
  settings: DeveloperSettings,
  change: (next: DeveloperSettings) => void,
): MenuItem[] {
  const toggle: MenuItem = {
    id: 'devInfiniteMoney',
    label: t(settings.infiniteMoney ? 'ui.dev.infiniteMoney.on' : 'ui.dev.infiniteMoney.off'),
    separated: true,
    onSelect: () => change({ ...settings, infiniteMoney: !settings.infiniteMoney }),
  };
  const speeds = GAME_SPEEDS.map(
    (speed): MenuItem => ({
      id: `devSpeed${speed}`,
      label: t(speed === settings.speed ? 'ui.dev.speedCurrent' : 'ui.dev.speed', { speed }),
      onSelect: () => change({ ...settings, speed }),
    }),
  );
  return [toggle, ...speeds];
}

/**
 * Developer settings kept in the browser and sent to the server whenever the connection goes
 * live, since the server forgets them when the tower is paused.
 */
export function useDeveloperMenu(
  developer: boolean,
  live: boolean,
  sendDebug: (type: string, payload: Record<string, unknown>) => boolean,
): { items: MenuItem[]; settings: DeveloperSettings } {
  const [settings, setSettings] = useState<DeveloperSettings>(load);

  useEffect(() => {
    if (!developer || !live) {
      return;
    }
    sendDebug('setInfiniteMoney', { enabled: settings.infiniteMoney });
    sendDebug('setSpeed', { speed: settings.speed });
  }, [developer, live, settings]);

  if (!developer) {
    return { items: [], settings };
  }
  return {
    items: developerMenuItems(settings, (next) => {
      save(next);
      setSettings(next);
    }),
    settings,
  };
}
