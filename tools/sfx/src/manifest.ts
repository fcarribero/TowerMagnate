import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Effect } from './effects';

export const MANIFEST_VERSION = 1;

export interface Cue {
  id: string;
  trigger: string;
  description: string;
  volume: number;
}

export interface ManifestFiles {
  ogg: string;
  mp3: string;
}

export interface ManifestEntry {
  id: string;
  files: ManifestFiles;
  volume: number;
  loop: boolean;
  trigger: string;
  description: string;
}

export interface SfxManifest {
  version: number;
  effects: ManifestEntry[];
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TRIGGER_PATTERN = /^[a-z]+(\.[a-z]+)+$/;

export async function loadCues(path: string): Promise<Cue[]> {
  const text = await readFile(path, 'utf8');
  return parseCues(JSON.parse(text));
}

export function parseCues(data: unknown): Cue[] {
  if (!isObject(data) || !Array.isArray(data.cues)) {
    throw new Error('cues file must be an object with a "cues" array');
  }
  const cues = data.cues.map((entry, index) => parseCue(entry, `cues[${index}]`));
  assertUnique(
    cues.map((cue) => cue.id),
    'cue id',
  );
  assertUnique(
    cues.map((cue) => cue.trigger),
    'trigger',
  );
  return cues;
}

function parseCue(entry: unknown, where: string): Cue {
  if (!isObject(entry)) {
    throw new Error(`${where} must be an object`);
  }
  const id = checkId(entry.id, where);
  return {
    id,
    trigger: checkTrigger(entry.trigger, id),
    description: checkDescription(entry.description, id),
    volume: checkVolume(entry.volume, id),
  };
}

export function buildManifest(effects: Effect[], cues: Cue[]): SfxManifest {
  const cuesById = new Map(cues.map((cue) => [cue.id, cue]));
  const effectIds = new Set(effects.map((effect) => effect.id));

  const effectsWithoutCue = effects.filter((effect) => !cuesById.has(effect.id));
  if (effectsWithoutCue.length > 0) {
    const ids = effectsWithoutCue.map((effect) => effect.id).join(', ');
    throw new Error(`effects without a cue: ${ids}`);
  }
  const cuesWithoutEffect = cues.filter((cue) => !effectIds.has(cue.id));
  if (cuesWithoutEffect.length > 0) {
    const ids = cuesWithoutEffect.map((cue) => cue.id).join(', ');
    throw new Error(`cues without an effect: ${ids}`);
  }

  const entries = effects.map((effect) => {
    const cue = cuesById.get(effect.id) as Cue;
    return {
      id: effect.id,
      files: filesFor(effect.id),
      volume: cue.volume,
      loop: effect.loop,
      trigger: cue.trigger,
      description: cue.description,
    };
  });
  return { version: MANIFEST_VERSION, effects: entries };
}

export function validateManifest(data: unknown): SfxManifest {
  if (!isObject(data) || data.version !== MANIFEST_VERSION || !Array.isArray(data.effects)) {
    throw new Error(
      `manifest must be an object with version ${MANIFEST_VERSION} and an "effects" array`,
    );
  }
  const effects = data.effects.map((entry, index) => validateEntry(entry, `effects[${index}]`));
  assertUnique(
    effects.map((entry) => entry.id),
    'manifest id',
  );
  assertUnique(
    effects.map((entry) => entry.trigger),
    'trigger',
  );
  return { version: MANIFEST_VERSION, effects };
}

function validateEntry(entry: unknown, where: string): ManifestEntry {
  if (!isObject(entry)) {
    throw new Error(`${where} must be an object`);
  }
  const id = checkId(entry.id, where);
  const files = filesFor(id);
  if (!isObject(entry.files) || entry.files.ogg !== files.ogg || entry.files.mp3 !== files.mp3) {
    throw new Error(`${id}: files must be ${files.ogg} and ${files.mp3}`);
  }
  if (typeof entry.loop !== 'boolean') {
    throw new Error(`${id}: loop must be true or false`);
  }
  return {
    id,
    files,
    volume: checkVolume(entry.volume, id),
    loop: entry.loop,
    trigger: checkTrigger(entry.trigger, id),
    description: checkDescription(entry.description, id),
  };
}

export async function missingFiles(manifest: SfxManifest, dir: string): Promise<string[]> {
  const files = manifest.effects.flatMap((entry) => [entry.files.ogg, entry.files.mp3]);
  const missing: string[] = [];
  for (const file of files) {
    if (!(await exists(join(dir, file)))) {
      missing.push(file);
    }
  }
  return missing;
}

export function formatManifest(manifest: SfxManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function filesFor(id: string): ManifestFiles {
  return { ogg: `${id}.ogg`, mp3: `${id}.mp3` };
}

function checkId(id: unknown, where: string): string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new Error(`${where}.id must be a kebab-case string`);
  }
  return id;
}

function checkTrigger(trigger: unknown, id: string): string {
  if (typeof trigger !== 'string' || !TRIGGER_PATTERN.test(trigger)) {
    throw new Error(`${id}: trigger must look like "area.event"`);
  }
  return trigger;
}

function checkDescription(description: unknown, id: string): string {
  if (typeof description !== 'string' || description.trim() === '') {
    throw new Error(`${id}: description must be a non-empty string`);
  }
  return description;
}

function checkVolume(volume: unknown, id: string): number {
  if (typeof volume !== 'number' || volume <= 0 || volume > 1) {
    throw new Error(`${id}: volume must be greater than 0 and at most 1`);
  }
  return volume;
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`duplicate ${label}: ${value}`);
    }
    seen.add(value);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
