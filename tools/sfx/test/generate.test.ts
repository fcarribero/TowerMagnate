import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'vitest';
import type { Effect } from '../src/effects';
import {
  generate,
  outputPaths,
  rawPath,
  type GenerateDeps,
  type GenerateOptions,
} from '../src/generate';

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

interface Calls {
  apiKey: number;
  requested: string[];
  encoded: string[];
}

function noCalls(): Calls {
  return { apiKey: 0, requested: [], encoded: [] };
}

function fakeDeps(calls: Calls): GenerateDeps {
  return {
    getApiKey: async () => {
      calls.apiKey += 1;
      return 'key';
    },
    requestSound: async (effect) => {
      calls.requested.push(effect.id);
      return Buffer.from('raw audio');
    },
    encode: async (_input, effect, outputs) => {
      calls.encoded.push(effect.id);
      await writeFile(outputs.ogg, 'ogg');
      await writeFile(outputs.mp3, 'mp3');
      return { gain: 0, result: { integrated: effect.loudness, truePeak: -3 } };
    },
    log: () => {},
  };
}

describe('generate', () => {
  let options: GenerateOptions;
  let calls: Calls;

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), 'sfx-gen-'));
    options = {
      effects: [click, ding],
      rawDir: join(root, 'raw'),
      outDir: join(root, 'out'),
      dryRun: false,
      reprocess: false,
    };
    calls = noCalls();
  });

  it('calls the API once per missing effect and keeps the raw file', async () => {
    const summary = await generate(options, fakeDeps(calls));
    assert.deepEqual(calls.requested, ['ui-click', 'elevator-ding']);
    assert.equal(calls.apiKey, 1);
    assert.deepEqual(summary.generated, ['ui-click', 'elevator-ding']);
    assert.deepEqual((await readdir(options.rawDir)).sort(), ['elevator-ding.mp3', 'ui-click.mp3']);
  });

  it('does not call the API or read the key on a second run', async () => {
    await generate(options, fakeDeps(calls));
    const second = noCalls();

    const summary = await generate(options, fakeDeps(second));

    assert.deepEqual(second, noCalls());
    assert.deepEqual(summary.skipped, ['ui-click', 'elevator-ding']);
  });

  it('re-encodes from the raw file without calling the API', async () => {
    await generate(options, fakeDeps(calls));
    const second = noCalls();

    await generate({ ...options, reprocess: true }, fakeDeps(second));

    assert.deepEqual(second.requested, []);
    assert.deepEqual(second.encoded, ['ui-click', 'elevator-ding']);
  });

  it('treats a half-written pair of outputs as missing', async () => {
    await generate(options, fakeDeps(calls));
    await rm(outputPaths(options.outDir, click).mp3);
    const second = noCalls();

    await generate(options, fakeDeps(second));

    assert.deepEqual(second.requested, []);
    assert.deepEqual(second.encoded, ['ui-click']);
  });

  it('writes nothing and calls nothing in a dry run', async () => {
    const summary = await generate({ ...options, dryRun: true }, fakeDeps(calls));
    assert.deepEqual(calls, noCalls());
    assert.deepEqual(summary.generated, ['ui-click', 'elevator-ding']);
    await assert.rejects(readdir(options.rawDir), { code: 'ENOENT' });
  });

  it('keeps going and reports effects whose encoding fails', async () => {
    const deps = fakeDeps(calls);
    const encode = deps.encode;
    deps.encode = async (input, effect, outputs) => {
      if (effect.id === 'ui-click') {
        throw new Error('audio is silent');
      }
      return encode(input, effect, outputs);
    };

    const summary = await generate(options, deps);

    assert.deepEqual(summary.failed, ['ui-click']);
    assert.deepEqual(summary.encoded, ['elevator-ding']);
    assert.deepEqual((await readdir(options.rawDir)).sort(), ['elevator-ding.mp3', 'ui-click.mp3']);
  });

  it('stores raw files by effect id', () => {
    assert.equal(rawPath('raw', click), join('raw', 'ui-click.mp3'));
  });
});
