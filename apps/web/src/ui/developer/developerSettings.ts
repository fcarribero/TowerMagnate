export const GAME_SPEEDS = [1, 2, 5, 10, 20] as const;

/** The speed that the keys 1 to 5 pick, or null for any other key. */
export function speedForKey(key: string): number | null {
  const index = key.length === 1 ? Number(key) - 1 : Number.NaN;
  return Number.isInteger(index) ? (GAME_SPEEDS[index] ?? null) : null;
}

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
