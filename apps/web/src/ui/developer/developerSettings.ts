export const GAME_SPEEDS = [1, 2, 5, 10, 20] as const;

export interface DeveloperSettings {
  infiniteMoney: boolean;
  speed: number;
}

const STORAGE_KEY = 'tm.developer';
const DEFAULTS: DeveloperSettings = { infiniteMoney: false, speed: 1 };

export function load(): DeveloperSettings {
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

export function save(settings: DeveloperSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The settings just are not remembered.
  }
}
