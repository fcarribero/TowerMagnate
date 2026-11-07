import { describe, expect, it } from 'vitest';
import { readRepoManifest } from '../testing/sfxManifestFile';
import { chooseSfxFormat, parseSfxManifest, sfxManifestUrl } from './sfxManifest';

const effect = {
  id: 'ui-click',
  files: { ogg: 'ui-click.ogg', mp3: 'ui-click.mp3' },
  volume: 0.5,
  loop: false,
  trigger: 'ui.click',
};

describe('parseSfxManifest', () => {
  it('reads the manifest written by tools/sfx', () => {
    const manifest = parseSfxManifest(readRepoManifest());
    expect(manifest.effects.map((each) => each.id)).toContain('construction');
  });

  it('keeps volume and loop of each effect', () => {
    const manifest = parseSfxManifest({ version: 1, effects: [{ ...effect, loop: true }] });
    expect(manifest.effects[0]).toEqual({ ...effect, loop: true });
  });

  it('rejects a volume outside 0 to 1', () => {
    expect(() => parseSfxManifest({ version: 1, effects: [{ ...effect, volume: 2 }] })).toThrow(
      /volume/,
    );
  });

  it('rejects an effect without both file formats', () => {
    const broken = { ...effect, files: { ogg: 'a.ogg' } };
    expect(() => parseSfxManifest({ version: 1, effects: [broken] })).toThrow(/ogg and mp3/);
  });

  it('rejects a repeated id', () => {
    expect(() => parseSfxManifest({ version: 1, effects: [effect, effect] })).toThrow(/repeats/);
  });

  it('rejects a file without an effects list', () => {
    expect(() => parseSfxManifest({ version: 1 })).toThrow(/effects/);
  });
});

describe('chooseSfxFormat', () => {
  it('prefers ogg when the browser plays it', () => {
    expect(chooseSfxFormat(() => 'probably')).toBe('ogg');
  });

  it('falls back to mp3', () => {
    expect(chooseSfxFormat(() => '')).toBe('mp3');
  });
});

describe('sfxManifestUrl', () => {
  it('lives under the site base', () => {
    expect(sfxManifestUrl('/game/')).toBe('/game/sfx/manifest.json');
  });
});
