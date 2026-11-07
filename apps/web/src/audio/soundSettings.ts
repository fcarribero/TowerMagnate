export interface SoundSettings {
  muted: boolean;
  /** 0 to 100. */
  volume: number;
}

export const SOUND_SETTINGS_KEY = 'tm.sound';

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { muted: false, volume: 70 };

export interface SettingsStore {
  read(): string | null;
  write(value: string): void;
}

export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return DEFAULT_SOUND_SETTINGS.volume;
  }
  return Math.min(100, Math.max(0, Math.round(volume)));
}

/** The factor every effect's own volume is multiplied by; 0 means play nothing. */
export function masterGain(settings: SoundSettings): number {
  return settings.muted ? 0 : clampVolume(settings.volume) / 100;
}

export function parseSoundSettings(raw: string | null): SoundSettings {
  if (raw === null) {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
  if (typeof data !== 'object' || data === null) {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
  const { muted, volume } = data as Partial<Record<keyof SoundSettings, unknown>>;
  return {
    muted: typeof muted === 'boolean' ? muted : DEFAULT_SOUND_SETTINGS.muted,
    volume: typeof volume === 'number' ? clampVolume(volume) : DEFAULT_SOUND_SETTINGS.volume,
  };
}

export function loadSoundSettings(store: SettingsStore): SoundSettings {
  return parseSoundSettings(store.read());
}

export function saveSoundSettings(store: SettingsStore, settings: SoundSettings): void {
  store.write(JSON.stringify(settings));
}

/**
 * Local storage can be missing or throw (disabled site data, private modes).
 * Then the settings only last for the session.
 */
export function browserSettingsStore(
  getStorage: () => Storage = () => window.localStorage,
): SettingsStore {
  return {
    read: () => {
      try {
        return getStorage().getItem(SOUND_SETTINGS_KEY);
      } catch {
        return null;
      }
    },
    write: (value) => {
      try {
        getStorage().setItem(SOUND_SETTINGS_KEY, value);
      } catch {
        // Keep the setting for this session only.
      }
    },
  };
}
