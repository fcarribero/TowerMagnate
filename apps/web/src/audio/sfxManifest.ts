/** Written by `tools/sfx` to `assets/sfx`, which Vite serves from the site root. */
export const SFX_FORMATS = ['ogg', 'mp3'] as const;

export type SfxFormat = (typeof SFX_FORMATS)[number];

export interface SfxEffect {
  id: string;
  files: Record<SfxFormat, string>;
  volume: number;
  loop: boolean;
  trigger: string;
  /** Stops a looping effect; null for one-shots. */
  stopTrigger: string | null;
  /** Real milliseconds before the effect can start again; 0 means no limit. */
  minIntervalMs: number;
  /** Gain for every other effect while this one plays; null means no ducking. */
  duckOthers: number | null;
}

export interface SfxManifest {
  version: number;
  effects: SfxEffect[];
}

export function sfxBaseUrl(baseUrl = import.meta.env.BASE_URL): string {
  return `${baseUrl}sfx/`;
}

export function sfxManifestUrl(baseUrl = import.meta.env.BASE_URL): string {
  return `${sfxBaseUrl(baseUrl)}manifest.json`;
}

const OGG_MIME = 'audio/ogg; codecs="vorbis"';

/** Ogg is smaller, but Safari only plays the mp3 copy. */
export function chooseSfxFormat(canPlayType: (mime: string) => string): SfxFormat {
  return canPlayType(OGG_MIME) === '' ? 'mp3' : 'ogg';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEffect(value: unknown, index: number): SfxEffect {
  const problem = (detail: string): Error =>
    new Error(`SFX manifest effect ${index} is invalid: ${detail}`);
  if (!isRecord(value)) {
    throw problem('not an object');
  }
  const { id, files, volume, loop, trigger, stopTrigger, minIntervalMs, duckOthers } = value;
  if (typeof id !== 'string' || id === '') {
    throw problem('missing id');
  }
  if (typeof trigger !== 'string' || trigger === '') {
    throw problem('missing trigger');
  }
  if (typeof volume !== 'number' || volume < 0 || volume > 1) {
    throw problem('volume must be from 0 to 1');
  }
  if (typeof loop !== 'boolean') {
    throw problem('loop must be true or false');
  }
  if (!isRecord(files) || typeof files.ogg !== 'string' || typeof files.mp3 !== 'string') {
    throw problem('files needs ogg and mp3');
  }
  if (stopTrigger !== null && (typeof stopTrigger !== 'string' || stopTrigger === '')) {
    throw problem('stopTrigger must be a name or null');
  }
  if (typeof minIntervalMs !== 'number' || minIntervalMs < 0) {
    throw problem('minIntervalMs must be 0 or more');
  }
  if (duckOthers !== null && (typeof duckOthers !== 'number' || duckOthers < 0 || duckOthers > 1)) {
    throw problem('duckOthers must be from 0 to 1 or null');
  }
  return {
    id,
    files: { ogg: files.ogg, mp3: files.mp3 },
    volume,
    loop,
    trigger,
    stopTrigger,
    minIntervalMs,
    duckOthers,
  };
}

export function parseSfxManifest(value: unknown): SfxManifest {
  if (!isRecord(value) || typeof value.version !== 'number' || !Array.isArray(value.effects)) {
    throw new Error('SFX manifest needs a version and an effects list');
  }
  const effects = value.effects.map(parseEffect);
  const seen = new Set<string>();
  for (const effect of effects) {
    if (seen.has(effect.id)) {
      throw new Error(`SFX manifest repeats the id ${effect.id}`);
    }
    seen.add(effect.id);
  }
  return { version: value.version, effects };
}
