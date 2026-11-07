import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Effect } from './effects';
import type { Loudness, OutputPaths } from './audio';

export interface GenerateOptions {
  effects: Effect[];
  rawDir: string;
  outDir: string;
  dryRun: boolean;
  reprocess: boolean;
}

export interface GenerateDeps {
  getApiKey: () => Promise<string>;
  requestSound: (effect: Effect, apiKey: string) => Promise<Buffer>;
  encode: (
    input: string,
    effect: Effect,
    outputs: OutputPaths,
  ) => Promise<{ gain: number; result: Loudness }>;
  log: (message: string) => void;
}

export interface GenerateSummary {
  skipped: string[];
  generated: string[];
  encoded: string[];
  failed: string[];
}

export function rawPath(rawDir: string, effect: Effect): string {
  return join(rawDir, `${effect.id}.mp3`);
}

export function outputPaths(outDir: string, effect: Effect): OutputPaths {
  return { ogg: join(outDir, `${effect.id}.ogg`), mp3: join(outDir, `${effect.id}.mp3`) };
}

export async function generate(
  options: GenerateOptions,
  deps: GenerateDeps,
): Promise<GenerateSummary> {
  const summary: GenerateSummary = { skipped: [], generated: [], encoded: [], failed: [] };
  let apiKey: string | undefined;

  if (!options.dryRun) {
    await mkdir(options.rawDir, { recursive: true });
    await mkdir(options.outDir, { recursive: true });
  }

  for (const effect of options.effects) {
    const source = rawPath(options.rawDir, effect);
    const outputs = outputPaths(options.outDir, effect);

    if (!options.reprocess && (await exists(outputs.ogg)) && (await exists(outputs.mp3))) {
      deps.log(`${effect.id}: already in ${options.outDir}, skipped`);
      summary.skipped.push(effect.id);
      continue;
    }

    if (!(await exists(source))) {
      if (options.dryRun) {
        deps.log(
          `${effect.id}: would call ElevenLabs (${effect.duration} s${effect.loop ? ', loop' : ''})`,
        );
        summary.generated.push(effect.id);
        continue;
      }
      apiKey ??= await deps.getApiKey();
      deps.log(`${effect.id}: calling ElevenLabs`);
      const audio = await deps.requestSound(effect, apiKey);
      await writeFile(source, audio);
      summary.generated.push(effect.id);
    }

    if (options.dryRun) {
      deps.log(`${effect.id}: would encode from ${source}`);
      summary.encoded.push(effect.id);
      continue;
    }
    try {
      const { gain, result } = await deps.encode(source, effect, outputs);
      deps.log(
        `${effect.id}: gain ${gain} dB, ${result.integrated} LUFS (target ${effect.loudness}), peak ${result.truePeak} dBTP`,
      );
      summary.encoded.push(effect.id);
    } catch (error) {
      deps.log(`${effect.id}: encoding failed, raw file kept at ${source}: ${errorMessage(error)}`);
      summary.failed.push(effect.id);
    }
  }
  return summary;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
