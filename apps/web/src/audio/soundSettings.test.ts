import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_SETTINGS_KEY,
  browserSettingsStore,
  clampVolume,
  loadSoundSettings,
  masterGain,
  parseSoundSettings,
  saveSoundSettings,
} from './soundSettings';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } as unknown as Storage;
}

function blockedStorage(): Storage {
  throw new DOMException('Access is denied', 'SecurityError');
}

describe('sound settings', () => {
  it('defaults to sound on at volume 70', () => {
    expect(DEFAULT_SOUND_SETTINGS).toEqual({ muted: false, volume: 70 });
    expect(parseSoundSettings(null)).toEqual({ muted: false, volume: 70 });
  });

  it('falls back to the defaults for broken or partial data', () => {
    expect(parseSoundSettings('not json')).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(parseSoundSettings('42')).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(parseSoundSettings('{"muted":true}')).toEqual({ muted: true, volume: 70 });
    expect(parseSoundSettings('{"volume":"loud"}')).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('keeps the volume a whole number from 0 to 100', () => {
    expect(clampVolume(-5)).toBe(0);
    expect(clampVolume(140)).toBe(100);
    expect(clampVolume(33.6)).toBe(34);
    expect(clampVolume(Number.NaN)).toBe(70);
    expect(parseSoundSettings('{"muted":false,"volume":250}').volume).toBe(100);
  });

  it('turns the settings into a gain factor', () => {
    expect(masterGain({ muted: false, volume: 70 })).toBeCloseTo(0.7);
    expect(masterGain({ muted: false, volume: 100 })).toBe(1);
    expect(masterGain({ muted: true, volume: 100 })).toBe(0);
  });

  it('saves and loads under one local storage key', () => {
    const storage = memoryStorage();
    const store = browserSettingsStore(() => storage);
    saveSoundSettings(store, { muted: true, volume: 40 });
    expect(JSON.parse(storage.getItem(SOUND_SETTINGS_KEY) ?? '')).toEqual({
      muted: true,
      volume: 40,
    });
    expect(loadSoundSettings(browserSettingsStore(() => storage))).toEqual({
      muted: true,
      volume: 40,
    });
  });

  it('works without local storage', () => {
    const store = browserSettingsStore(blockedStorage);
    expect(() => saveSoundSettings(store, { muted: true, volume: 10 })).not.toThrow();
    expect(loadSoundSettings(store)).toEqual(DEFAULT_SOUND_SETTINGS);
  });
});
