import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import {
  computeGain,
  encodeArgs,
  ffmpegBinary,
  levelFilter,
  measureLoudness,
  normalizeAndEncode,
  parseLoudnormReport,
  shapeFilter,
} from '../src/audio';
import type { Effect } from '../src/effects';

const click: Effect = {
  id: 'ui-click',
  prompt: 'click',
  duration: 0.2,
  loop: false,
  loudness: -20,
};
const ding: Effect = {
  id: 'elevator-ding',
  prompt: 'ding',
  duration: 1.2,
  loop: false,
  loudness: -18,
};
const hum: Effect = { id: 'elevator-move', prompt: 'hum', duration: 4, loop: true, loudness: -24 };

describe('shapeFilter', () => {
  it('trims one-shots to their duration with a short fade-out', () => {
    assert.match(shapeFilter(click), /atrim=end=0\.2,afade=t=out:st=0\.15:d=0\.05$/);
    assert.match(shapeFilter(ding), /atrim=end=1\.2,afade=t=out:st=1\.1:d=0\.1$/);
  });

  it('downmixes one-shots to mono and removes their leading silence', () => {
    assert.match(shapeFilter(ding), /^aformat=channel_layouts=mono,silenceremove=start_periods=1/);
  });

  it('only fixes the channel layout of loops so the seam stays clean', () => {
    assert.equal(shapeFilter(hum), 'aformat=channel_layouts=stereo');
  });
});

describe('parseLoudnormReport', () => {
  const report =
    '[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-23.40",\n\t"input_tp" : "-5.10",\n\t"input_lra" : "1.0"\n}\n';

  it('reads integrated loudness and true peak', () => {
    assert.deepEqual(parseLoudnormReport(report), { integrated: -23.4, truePeak: -5.1 });
  });

  it('fails on silent input', () => {
    const silent = report.replace('-23.40', '-inf').replace('-5.10', '-inf');
    assert.throws(() => parseLoudnormReport(silent), /silent/);
  });

  it('fails when there is no report', () => {
    assert.throws(() => parseLoudnormReport('error'), /loudness report/);
  });
});

describe('computeGain', () => {
  const loud = { ...ding, loudness: -16 };

  it('moves the integrated loudness to the target', () => {
    assert.equal(computeGain({ integrated: -23.4, truePeak: -10 }, loud), 7.4);
    assert.equal(computeGain({ integrated: -10, truePeak: -0.5 }, loud), -6);
  });

  it('lets the limiter take up to 6 dB of a one-shot peak', () => {
    assert.equal(computeGain({ integrated: -20, truePeak: -1 }, loud), 4);
    assert.equal(computeGain({ integrated: -30, truePeak: -4 }, loud), 9);
  });

  it('stops loops at the true-peak ceiling', () => {
    assert.equal(computeGain({ integrated: -30, truePeak: -4 }, { ...hum, loudness: -16 }), 3);
  });
});

describe('levelFilter', () => {
  it('limits one-shots without delaying them', () => {
    assert.match(levelFilter(ding, 2.5), /^volume=2\.5dB,alimiter=limit=0\.708:.*latency=true$/);
  });

  it('applies plain gain to loops', () => {
    assert.equal(levelFilter(hum, -1), 'volume=-1dB');
  });
});

describe('encodeArgs', () => {
  it('writes mono ogg and mp3 for one-shots', () => {
    const args = encodeArgs('in.mp3', ding, 2.5, { ogg: 'a.ogg', mp3: 'a.mp3' }).join(' ');
    assert.match(args, /volume=2\.5dB,alimiter=\S+ -ar 44100 -ac 1 .* -c:a libvorbis .* a\.ogg/);
    assert.match(args, /-c:a libmp3lame -b:a 128k -f mp3 a\.mp3$/);
  });

  it('keeps loops in stereo', () => {
    const args = encodeArgs('in.mp3', hum, 0, { ogg: 'a.ogg', mp3: 'a.mp3' });
    assert.equal(args[args.indexOf('-ac') + 1], '2');
  });
});

const ffmpeg = ffmpegBinary();
const hasFfmpeg = spawnSync(ffmpeg, ['-version']).status === 0;

describe.skipIf(!hasFfmpeg)('normalizeAndEncode with ffmpeg', { timeout: 30_000 }, () => {
  async function makeTone(
    dir: string,
    seconds: number,
    volume: number,
    channels = 1,
  ): Promise<string> {
    const file = join(dir, 'tone.mp3');
    const result = spawnSync(ffmpeg, [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=880:duration=${seconds}`,
      '-af',
      `volume=${volume}dB`,
      '-ac',
      String(channels),
      '-c:a',
      'libmp3lame',
      file,
    ]);
    assert.equal(result.status, 0, String(result.stderr));
    return file;
  }

  it('brings a quiet tone to the target loudness in both formats', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sfx-audio-'));
    const input = await makeTone(dir, 1.5, -15);
    const outputs = { ogg: join(dir, 'ding.ogg'), mp3: join(dir, 'ding.mp3') };

    const { result } = await normalizeAndEncode(ffmpeg, input, ding, outputs);

    assert.ok(Math.abs(result.integrated - ding.loudness) < 1, `ogg at ${result.integrated} LUFS`);
    assert.ok(result.truePeak <= -0.5, `peak ${result.truePeak}`);
    const mp3 = await measureLoudness(ffmpeg, outputs.mp3);
    assert.ok(Math.abs(mp3.integrated - ding.loudness) < 1, `mp3 at ${mp3.integrated} LUFS`);
  });

  it('reaches the target when a stereo source is downmixed to mono', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sfx-audio-'));
    const input = await makeTone(dir, 1.5, -15, 2);
    const outputs = { ogg: join(dir, 'ding.ogg'), mp3: join(dir, 'ding.mp3') };

    const { result } = await normalizeAndEncode(ffmpeg, input, ding, outputs);

    assert.ok(Math.abs(result.integrated - ding.loudness) < 1, `ogg at ${result.integrated} LUFS`);
  });

  it('keeps a peaky one-shot under the ceiling after limiting', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sfx-audio-'));
    const input = await makeTone(dir, 1.5, -1);
    const quiet = { ...ding, loudness: -6 };
    const outputs = { ogg: join(dir, 'bell.ogg'), mp3: join(dir, 'bell.mp3') };

    const { result } = await normalizeAndEncode(ffmpeg, input, quiet, outputs);

    assert.ok(result.truePeak <= -1, `peak ${result.truePeak}`);
  });

  it('measures clips shorter than the loudness window', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sfx-audio-'));
    const input = await makeTone(dir, 0.5, -10);
    const outputs = { ogg: join(dir, 'click.ogg'), mp3: join(dir, 'click.mp3') };

    const { result } = await normalizeAndEncode(ffmpeg, input, click, outputs);

    assert.ok(
      Math.abs(result.integrated - click.loudness) < 1.5,
      `ogg at ${result.integrated} LUFS`,
    );
    assert.ok((await stat(outputs.ogg)).size > 0);
  });
});
