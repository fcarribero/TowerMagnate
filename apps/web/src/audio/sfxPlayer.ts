import type { SfxEffect, SfxFormat, SfxManifest } from './sfxManifest';

export interface SfxHandle {
  stop(): void;
}

const SILENT: SfxHandle = { stop: () => {} };

export type FileFetcher = (url: string) => Promise<ArrayBuffer>;

export interface SfxPlayerOptions {
  baseUrl: string;
  format: SfxFormat;
  fetchFile?: FileFetcher;
  createAudioContext?: () => AudioContext;
  warn?: (message: string) => void;
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response.arrayBuffer();
}

/**
 * Downloads the effects as soon as it has the manifest, but creates the
 * AudioContext only in `unlock`, which must run inside a user gesture.
 */
export class SfxPlayer {
  private readonly baseUrl: string;
  private readonly format: SfxFormat;
  private readonly fetchFile: FileFetcher;
  private readonly createAudioContext: () => AudioContext;
  private readonly warn: (message: string) => void;

  private effects: Map<string, SfxEffect> | null = null;
  private readonly downloads = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly warnedIds = new Set<string>();
  private context: AudioContext | null = null;
  private master = 1;
  /** Gain nodes of looping effects still playing, with the effect's own volume. */
  private readonly loopGains = new Map<GainNode, number>();

  constructor(options: SfxPlayerOptions) {
    this.baseUrl = options.baseUrl;
    this.format = options.format;
    this.fetchFile = options.fetchFile ?? fetchArrayBuffer;
    this.createAudioContext = options.createAudioContext ?? (() => new AudioContext());
    this.warn = options.warn ?? ((message) => console.warn(message));
  }

  get unlocked(): boolean {
    return this.context !== null;
  }

  get ready(): boolean {
    return this.effects !== null;
  }

  /** Scales every effect, including loops already playing. 0 plays nothing. */
  setMasterGain(gain: number): void {
    this.master = Math.min(1, Math.max(0, gain));
    for (const [node, volume] of this.loopGains) {
      node.gain.value = volume * this.master;
    }
  }

  idForTrigger(trigger: string): string | undefined {
    for (const effect of this.effects?.values() ?? []) {
      if (effect.trigger === trigger) {
        return effect.id;
      }
    }
    return undefined;
  }

  /** Starts downloading every file; resolves when all downloads have settled. */
  async setManifest(manifest: SfxManifest): Promise<void> {
    this.effects = new Map(manifest.effects.map((effect) => [effect.id, effect]));
    for (const effect of manifest.effects) {
      this.downloads.set(effect.id, this.download(effect));
    }
    await Promise.all(this.downloads.values());
    if (this.context !== null) {
      await this.decodeAll(this.context);
    }
  }

  async unlock(): Promise<void> {
    if (this.context !== null) {
      return;
    }
    const context = this.createAudioContext();
    this.context = context;
    if (context.state === 'suspended') {
      await context.resume();
    }
    await this.decodeAll(context);
  }

  playSfx(id: string): SfxHandle {
    if (this.effects === null) {
      return SILENT;
    }
    const effect = this.effects.get(id);
    if (effect === undefined) {
      this.warnUnknown(id);
      return SILENT;
    }
    const buffer = this.buffers.get(id);
    if (this.master === 0 && !effect.loop) {
      return SILENT;
    }
    if (this.context === null || buffer === undefined) {
      return SILENT;
    }
    return this.start(this.context, buffer, effect);
  }

  private start(context: AudioContext, buffer: AudioBuffer, effect: SfxEffect): SfxHandle {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = effect.loop;
    const gain = context.createGain();
    gain.gain.value = effect.volume * this.master;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
    if (effect.loop) {
      this.loopGains.set(gain, effect.volume);
    }
    return {
      stop: () => {
        this.loopGains.delete(gain);
        source.stop();
        source.disconnect();
      },
    };
  }

  private warnUnknown(id: string): void {
    if (!this.warnedIds.has(id)) {
      this.warnedIds.add(id);
      this.warn(`Unknown sound effect "${id}"`);
    }
  }

  private async download(effect: SfxEffect): Promise<ArrayBuffer | null> {
    const url = `${this.baseUrl}${effect.files[this.format]}`;
    try {
      return await this.fetchFile(url);
    } catch (error) {
      this.warn(`Could not load sound effect "${effect.id}": ${String(error)}`);
      return null;
    }
  }

  private async decodeAll(context: AudioContext): Promise<void> {
    const pending = [...this.downloads].map(async ([id, download]) => {
      const data = await download;
      if (data === null || this.buffers.has(id)) {
        return;
      }
      try {
        // decodeAudioData detaches its input, so keep the download reusable.
        this.buffers.set(id, await context.decodeAudioData(data.slice(0)));
      } catch (error) {
        this.warn(`Could not decode sound effect "${id}": ${String(error)}`);
      }
    });
    await Promise.all(pending);
  }
}

const GESTURE_EVENTS = ['pointerdown', 'keydown'] as const;

/** Browsers block audio until the user clicks or presses a key on the page. */
export function unlockOnFirstGesture(target: EventTarget, unlock: () => void): () => void {
  const onGesture = (): void => {
    removeListeners();
    unlock();
  };
  const removeListeners = (): void => {
    for (const type of GESTURE_EVENTS) {
      target.removeEventListener(type, onGesture, true);
    }
  };
  for (const type of GESTURE_EVENTS) {
    target.addEventListener(type, onGesture, true);
  }
  return removeListeners;
}
