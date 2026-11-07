import { spawn } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import type { Effect } from './effects';

export const TRUE_PEAK_CEILING = -1;
const SAMPLE_RATE = 44100;
const MEASURE_PAD_SECONDS = 3;
const LEADING_SILENCE_THRESHOLD = '-60dB';
const MAX_FADE_OUT = 0.1;
const MAX_LIMITING = 6;
const LIMITER_CEILING = 0.708;

export interface Loudness {
  integrated: number;
  truePeak: number;
}

export interface OutputPaths {
  ogg: string;
  mp3: string;
}

export function ffmpegBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

export function shapeFilter(effect: Effect): string {
  if (effect.loop) {
    return 'aformat=channel_layouts=stereo';
  }
  const fade = round(Math.min(MAX_FADE_OUT, effect.duration / 4));
  const fadeStart = round(effect.duration - fade);
  return [
    'aformat=channel_layouts=mono',
    `silenceremove=start_periods=1:start_threshold=${LEADING_SILENCE_THRESHOLD}`,
    `atrim=end=${effect.duration}`,
    `afade=t=out:st=${fadeStart}:d=${fade}`,
  ].join(',');
}

export function measureFilter(shape: string): string {
  return `${shape},apad=whole_dur=${MEASURE_PAD_SECONDS},loudnorm=print_format=json`;
}

export function parseLoudnormReport(stderr: string): Loudness {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end < start) {
    throw new Error('ffmpeg did not print a loudness report');
  }
  const report = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
  const integrated = Number(report.input_i);
  const truePeak = Number(report.input_tp);
  if (!Number.isFinite(integrated) || !Number.isFinite(truePeak)) {
    throw new Error('audio is silent or too quiet to measure');
  }
  return { integrated, truePeak };
}

export function computeGain(measured: Loudness, effect: Effect): number {
  const gainToTarget = effect.loudness - measured.integrated;
  const allowedLimiting = effect.loop ? 0 : MAX_LIMITING;
  const gainToCeiling = TRUE_PEAK_CEILING - measured.truePeak + allowedLimiting;
  return round(Math.min(gainToTarget, gainToCeiling));
}

export function levelFilter(effect: Effect, gain: number): string {
  const volume = `volume=${gain}dB`;
  if (effect.loop) {
    return volume;
  }
  return `${volume},alimiter=limit=${LIMITER_CEILING}:attack=1:release=50:level=false:latency=true`;
}

export function channelCount(effect: Effect): number {
  return effect.loop ? 2 : 1;
}

export function encodeArgs(
  input: string,
  effect: Effect,
  gain: number,
  outputs: OutputPaths,
): string[] {
  const filter = `${shapeFilter(effect)},${levelFilter(effect, gain)}`;
  const common = [
    '-af',
    filter,
    '-ar',
    String(SAMPLE_RATE),
    '-ac',
    String(channelCount(effect)),
    '-map_metadata',
    '-1',
  ];
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input,
    ...common,
    '-c:a',
    'libvorbis',
    '-q:a',
    '4',
    '-f',
    'ogg',
    outputs.ogg,
    ...common,
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    '-f',
    'mp3',
    outputs.mp3,
  ];
}

export async function assertFfmpegAvailable(binary: string): Promise<void> {
  try {
    await runFfmpeg(binary, ['-hide_banner', '-version']);
  } catch {
    throw new Error(
      `ffmpeg not found ("${binary}"). Install ffmpeg with libvorbis and libmp3lame, or set FFMPEG_PATH.`,
    );
  }
}

export async function measureLoudness(
  binary: string,
  input: string,
  shape = 'anull',
): Promise<Loudness> {
  const stderr = await runFfmpeg(binary, [
    '-hide_banner',
    '-nostats',
    '-i',
    input,
    '-af',
    measureFilter(shape),
    '-f',
    'null',
    '-',
  ]);
  return parseLoudnormReport(stderr);
}

export async function normalizeAndEncode(
  binary: string,
  input: string,
  effect: Effect,
  outputs: OutputPaths,
): Promise<{ gain: number; result: Loudness }> {
  const measured = await measureLoudness(binary, input, shapeFilter(effect));
  const gain = computeGain(measured, effect);
  const partial = { ogg: `${outputs.ogg}.partial`, mp3: `${outputs.mp3}.partial` };
  try {
    await runFfmpeg(binary, encodeArgs(input, effect, gain, partial));
    await rename(partial.ogg, outputs.ogg);
    await rename(partial.mp3, outputs.mp3);
  } finally {
    await rm(partial.ogg, { force: true });
    await rm(partial.mp3, { force: true });
  }
  const result = await measureLoudness(binary, outputs.ogg);
  return { gain, result };
}

function runFfmpeg(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stderr);
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim().slice(-500)}`));
      }
    });
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
