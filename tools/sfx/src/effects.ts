import { readFile } from "node:fs/promises";

export interface Effect {
  id: string;
  prompt: string;
  duration: number;
  loop: boolean;
  loudness: number;
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MIN_DURATION = 0.1;
const MAX_DURATION = 30;
const MIN_LOUDNESS = -40;
const MAX_LOUDNESS = -6;

export async function loadEffects(path: string): Promise<Effect[]> {
  const text = await readFile(path, "utf8");
  return parseEffects(JSON.parse(text));
}

export function parseEffects(data: unknown): Effect[] {
  if (!isObject(data) || !Array.isArray(data.effects)) {
    throw new Error('effects file must be an object with an "effects" array');
  }
  const effects = data.effects.map((entry, index) => parseEffect(entry, index));
  assertUniqueIds(effects);
  return effects;
}

function parseEffect(entry: unknown, index: number): Effect {
  const where = `effects[${index}]`;
  if (!isObject(entry)) {
    throw new Error(`${where} must be an object`);
  }
  const { id, prompt, duration, loop, loudness } = entry;

  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new Error(`${where}.id must be a kebab-case string`);
  }
  if (typeof prompt !== "string" || prompt.trim() === "") {
    throw new Error(`${id}: prompt must be a non-empty string`);
  }
  if (typeof duration !== "number" || duration < MIN_DURATION || duration > MAX_DURATION) {
    throw new Error(`${id}: duration must be between ${MIN_DURATION} and ${MAX_DURATION} seconds`);
  }
  if (typeof loop !== "boolean") {
    throw new Error(`${id}: loop must be true or false`);
  }
  if (typeof loudness !== "number" || loudness < MIN_LOUDNESS || loudness > MAX_LOUDNESS) {
    throw new Error(`${id}: loudness must be between ${MIN_LOUDNESS} and ${MAX_LOUDNESS} LUFS`);
  }
  return { id, prompt, duration, loop, loudness };
}

function assertUniqueIds(effects: Effect[]): void {
  const seen = new Set<string>();
  for (const effect of effects) {
    if (seen.has(effect.id)) {
      throw new Error(`duplicate effect id: ${effect.id}`);
    }
    seen.add(effect.id);
  }
}

export function selectEffects(effects: Effect[], only: string[]): Effect[] {
  if (only.length === 0) {
    return effects;
  }
  const unknown = only.filter((id) => !effects.some((effect) => effect.id === id));
  if (unknown.length > 0) {
    throw new Error(`unknown effect id: ${unknown.join(", ")}`);
  }
  return effects.filter((effect) => only.includes(effect.id));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
