import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import {
  chooseSfxFormat,
  parseSfxManifest,
  sfxBaseUrl,
  sfxManifestUrl,
  type SfxFormat,
} from './sfxManifest';
import { SfxPlayer, unlockOnFirstGesture, type SfxHandle } from './sfxPlayer';
import {
  DEFAULT_SOUND_SETTINGS,
  browserSettingsStore,
  clampVolume,
  loadSoundSettings,
  masterGain,
  saveSoundSettings,
  type SettingsStore,
  type SoundSettings,
} from './soundSettings';
import { SfxCues } from './sfxCues';
import { SfxDirector, type SfxTrigger } from './sfxTriggers';

export interface Sfx {
  playSfx(id: string): SfxHandle;
  playTrigger(trigger: SfxTrigger): void;
  director: SfxDirector;
}

export function createSfx(player: SfxPlayer): Sfx {
  const cues = new SfxCues(player);
  return {
    playSfx: (id) => player.playSfx(id),
    playTrigger: (trigger) => cues.play(trigger),
    director: new SfxDirector({
      play: (trigger) => cues.play(trigger),
      startLoop: (trigger) => cues.startLoop(trigger),
      stopLoop: (trigger) => cues.stopLoop(trigger),
    }),
  };
}

function browserFormat(): SfxFormat {
  const probe = document.createElement('audio');
  return chooseSfxFormat((mime) => probe.canPlayType(mime));
}

async function loadManifest(player: SfxPlayer): Promise<void> {
  const response = await fetch(sfxManifestUrl());
  if (!response.ok) {
    throw new Error(`Sound manifest answered ${response.status}`);
  }
  await player.setManifest(parseSfxManifest(await response.json()));
}

const SILENT_SFX = createSfx(new SfxPlayer({ baseUrl: '', format: 'mp3' }));

const SfxContext = createContext<Sfx>(SILENT_SFX);

export function useSfx(): Sfx {
  return useContext(SfxContext);
}

export interface SoundSettingsControl {
  settings: SoundSettings;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
}

const SoundSettingsContext = createContext<SoundSettingsControl>({
  settings: DEFAULT_SOUND_SETTINGS,
  setMuted: () => {},
  setVolume: () => {},
});

export function useSoundSettings(): SoundSettingsControl {
  return useContext(SoundSettingsContext);
}

function useStoredSoundSettings(player: SfxPlayer, store: SettingsStore): SoundSettingsControl {
  const [settings, setSettings] = useState(() => loadSoundSettings(store));

  useEffect(() => {
    player.setMasterGain(masterGain(settings));
  }, [player, settings]);

  return useMemo(() => {
    const update = (next: SoundSettings): void => {
      saveSoundSettings(store, next);
      setSettings(next);
    };
    return {
      settings,
      setMuted: (muted) => update({ ...settings, muted }),
      setVolume: (volume) => update({ ...settings, volume: clampVolume(volume) }),
    };
  }, [settings, store]);
}

interface SfxProviderProps {
  children: ComponentChildren;
  player?: SfxPlayer;
  settingsStore?: SettingsStore;
}

/** Owns the page's sound player: loads the manifest and unlocks on the first gesture. */
export function SfxProvider({
  children,
  player: givenPlayer,
  settingsStore: givenStore,
}: SfxProviderProps) {
  const player = useMemo(
    () => givenPlayer ?? new SfxPlayer({ baseUrl: sfxBaseUrl(), format: browserFormat() }),
    [givenPlayer],
  );
  const sfx = useMemo(() => createSfx(player), [player]);
  const store = useMemo(() => givenStore ?? browserSettingsStore(), [givenStore]);
  const soundSettings = useStoredSoundSettings(player, store);

  useEffect(() => {
    if (!player.ready) {
      loadManifest(player).catch((error: unknown) => {
        console.warn('Sound effects are off: could not load the manifest', error);
      });
    }
    return unlockOnFirstGesture(window, () => {
      player.unlock().catch((error: unknown) => {
        console.warn('Could not start audio', error);
      });
    });
  }, [player]);

  return (
    <SfxContext.Provider value={sfx}>
      <SoundSettingsContext.Provider value={soundSettings}>
        {children}
      </SoundSettingsContext.Provider>
    </SfxContext.Provider>
  );
}
