import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'vitest';
import { loadEffects, type Effect } from '../src/effects';
import {
  buildManifest,
  formatManifest,
  loadCues,
  missingFiles,
  parseCues,
  validateManifest,
  type Cue,
} from '../src/manifest';

const click: Effect = {
  id: 'ui-click',
  prompt: 'click',
  duration: 0.2,
  loop: false,
  loudness: -20,
};
const hum: Effect = { id: 'elevator-move', prompt: 'hum', duration: 4, loop: true, loudness: -24 };
const clickCue: Cue = {
  id: 'ui-click',
  trigger: 'ui.click',
  description: 'A button.',
  volume: 0.5,
};
const humCue: Cue = {
  id: 'elevator-move',
  trigger: 'elevator.travel',
  description: 'A car moves.',
  volume: 0.4,
};

describe('parseCues', () => {
  it('accepts a valid list', () => {
    assert.deepEqual(parseCues({ cues: [clickCue, humCue] }), [clickCue, humCue]);
  });

  it('rejects a file without a cues array', () => {
    assert.throws(() => parseCues([clickCue]), /"cues" array/);
  });

  it('rejects a trigger that is not area.event', () => {
    assert.throws(() => parseCues({ cues: [{ ...clickCue, trigger: 'click' }] }), /trigger/);
  });

  it('rejects a volume outside (0, 1]', () => {
    assert.throws(() => parseCues({ cues: [{ ...clickCue, volume: 0 }] }), /volume/);
    assert.throws(() => parseCues({ cues: [{ ...clickCue, volume: 1.5 }] }), /volume/);
  });

  it('rejects an empty description', () => {
    assert.throws(() => parseCues({ cues: [{ ...clickCue, description: ' ' }] }), /description/);
  });

  it('rejects two cues on the same trigger', () => {
    const twin = { ...humCue, trigger: 'ui.click' };
    assert.throws(() => parseCues({ cues: [clickCue, twin] }), /duplicate trigger: ui.click/);
  });
});

describe('buildManifest', () => {
  it('joins each effect with its cue in effect order', () => {
    const manifest = buildManifest([hum, click], [clickCue, humCue]);
    assert.deepEqual(manifest, {
      version: 1,
      effects: [
        {
          id: 'elevator-move',
          files: { ogg: 'elevator-move.ogg', mp3: 'elevator-move.mp3' },
          volume: 0.4,
          loop: true,
          trigger: 'elevator.travel',
          description: 'A car moves.',
        },
        {
          id: 'ui-click',
          files: { ogg: 'ui-click.ogg', mp3: 'ui-click.mp3' },
          volume: 0.5,
          loop: false,
          trigger: 'ui.click',
          description: 'A button.',
        },
      ],
    });
  });

  it('fails when an effect has no cue', () => {
    assert.throws(() => buildManifest([click, hum], [clickCue]), /without a cue: elevator-move/);
  });

  it('fails when a cue has no effect', () => {
    assert.throws(() => buildManifest([click], [clickCue, humCue]), /without an effect/);
  });
});

describe('validateManifest', () => {
  const valid = buildManifest([click, hum], [clickCue, humCue]);

  it('accepts a built manifest', () => {
    assert.deepEqual(validateManifest(JSON.parse(formatManifest(valid))), valid);
  });

  it('rejects an unknown version', () => {
    assert.throws(() => validateManifest({ ...valid, version: 2 }), /version 1/);
  });

  it('rejects files that do not match the id', () => {
    const [first] = valid.effects;
    const renamed = { ...first, files: { ogg: 'other.ogg', mp3: 'ui-click.mp3' } };
    assert.throws(() => validateManifest({ version: 1, effects: [renamed] }), /files must be/);
  });

  it('rejects a missing loop flag', () => {
    const withoutLoop: Record<string, unknown> = { ...valid.effects[0] };
    delete withoutLoop.loop;
    assert.throws(() => validateManifest({ version: 1, effects: [withoutLoop] }), /loop/);
  });

  it('rejects duplicate ids', () => {
    const [first] = valid.effects;
    assert.throws(
      () => validateManifest({ version: 1, effects: [first, first] }),
      /duplicate manifest id/,
    );
  });
});

describe('missingFiles', () => {
  it('lists the files that are not on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sfx-manifest-'));
    await writeFile(join(dir, 'ui-click.ogg'), 'placeholder');
    await writeFile(join(dir, 'ui-click.mp3'), 'placeholder');
    await writeFile(join(dir, 'elevator-move.ogg'), 'placeholder');
    const manifest = buildManifest([click, hum], [clickCue, humCue]);
    assert.deepEqual(await missingFiles(manifest, dir), ['elevator-move.mp3']);
  });
});

describe('the committed manifest', () => {
  const packageDir = resolve(import.meta.dirname, '..');
  const sfxDir = resolve(packageDir, '..', '..', 'assets', 'sfx');

  async function committedManifest(): Promise<unknown> {
    return JSON.parse(await readFile(join(sfxDir, 'manifest.json'), 'utf8'));
  }

  it('passes the schema', async () => {
    validateManifest(await committedManifest());
  });

  it('matches effects.json and cues.json', async () => {
    const effects = await loadEffects(join(packageDir, 'effects.json'));
    const cues = await loadCues(join(packageDir, 'cues.json'));
    const expected = formatManifest(buildManifest(effects, cues));
    const actual = await readFile(join(sfxDir, 'manifest.json'), 'utf8');
    assert.equal(actual.replace(/\r\n/g, '\n'), expected, 'run pnpm manifest in tools/sfx');
  });

  it('has every listed file on disk', async () => {
    const manifest = validateManifest(await committedManifest());
    assert.deepEqual(await missingFiles(manifest, sfxDir), []);
  });

  it('lists every audio file in the folder', async () => {
    const manifest = validateManifest(await committedManifest());
    const listed = new Set(manifest.effects.flatMap((entry) => [entry.files.ogg, entry.files.mp3]));
    const audioFiles = (await readdir(sfxDir)).filter(
      (file) => file.endsWith('.ogg') || file.endsWith('.mp3'),
    );
    assert.deepEqual(
      audioFiles.filter((file) => !listed.has(file)),
      [],
    );
  });
});
