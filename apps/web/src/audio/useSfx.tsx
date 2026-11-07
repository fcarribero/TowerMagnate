import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo } from 'preact/hooks';
import {
  chooseSfxFormat,
  parseSfxManifest,
  sfxBaseUrl,
  sfxManifestUrl,
  type SfxFormat,
} from './sfxManifest';
import { SfxPlayer, unlockOnFirstGesture, type SfxHandle } from './sfxPlayer';
import { SfxDirector, type SfxTrigger } from './sfxTriggers';

export interface Sfx {
  playSfx(id: string): SfxHandle;
  playTrigger(trigger: SfxTrigger): void;
  director: SfxDirector;
}

export function createSfx(player: SfxPlayer): Sfx {
  const playTrigger = (trigger: SfxTrigger): void => {
    const id = player.idForTrigger(trigger);
    if (id !== undefined) {
      player.playSfx(id);
    }
  };
  return {
    playSfx: (id) => player.playSfx(id),
    playTrigger,
    director: new SfxDirector(playTrigger),
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

interface SfxProviderProps {
  children: ComponentChildren;
  player?: SfxPlayer;
}

/** Owns the page's sound player: loads the manifest and unlocks on the first gesture. */
export function SfxProvider({ children, player: givenPlayer }: SfxProviderProps) {
  const player = useMemo(
    () => givenPlayer ?? new SfxPlayer({ baseUrl: sfxBaseUrl(), format: browserFormat() }),
    [givenPlayer],
  );
  const sfx = useMemo(() => createSfx(player), [player]);

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

  return <SfxContext.Provider value={sfx}>{children}</SfxContext.Provider>;
}
