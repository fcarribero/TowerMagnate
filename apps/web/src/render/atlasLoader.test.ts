// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ATLAS_NAMES, atlasUrl, loadSprites, type LoadedSheet } from './atlasLoader';
import { SPRITE_IDS } from './atlasManifest';
import { SpriteRegistry } from './spriteRegistry';

const atlasesDir = fileURLToPath(new URL('../../../../assets/atlases', import.meta.url));

interface AtlasJson {
  frames: Record<string, unknown>;
}

function committedFrameIds(name: string): string[] {
  const json = JSON.parse(readFileSync(join(atlasesDir, `${name}.json`), 'utf8')) as AtlasJson;
  return Object.keys(json.frames);
}

function atlasNameFromUrl(url: string): string {
  const fileName = url.split('/').pop() ?? '';
  return fileName.replace('.json', '');
}

function sheetFromCommittedJson(url: string): Promise<LoadedSheet> {
  const textures: Record<string, Texture> = {};
  for (const id of committedFrameIds(atlasNameFromUrl(url))) {
    textures[id] = new Texture();
  }
  return Promise.resolve({ textures });
}

describe('atlasUrl', () => {
  it('points at the atlas JSON under the base URL', () => {
    expect(atlasUrl('sky', '/')).toBe('/atlases/sky.json');
    expect(atlasUrl('units', '/game/')).toBe('/game/atlases/units.json');
  });
});

describe('atlas manifest', () => {
  it('lists every atlas the art build wrote', () => {
    const built = readdirSync(atlasesDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', ''))
      .sort();
    expect([...ATLAS_NAMES].sort()).toEqual(built);
  });

  it('names exactly the sprite ids in the committed atlases', () => {
    const committed = ATLAS_NAMES.flatMap(committedFrameIds).sort();
    expect([...SPRITE_IDS].sort()).toEqual(committed);
  });
});

describe('loadSprites', () => {
  it('registers every frame of every committed atlas', async () => {
    const registry = await loadSprites(sheetFromCommittedJson);
    const expectedIds = ATLAS_NAMES.flatMap(committedFrameIds);
    expect(registry.size).toBe(expectedIds.length);
    for (const id of expectedIds) {
      expect(registry.has(id), id).toBe(true);
    }
  });

  it('requests each atlas once', async () => {
    const requested: string[] = [];
    await loadSprites((url) => {
      requested.push(url);
      return Promise.resolve({ textures: {} });
    });
    expect(requested.sort()).toEqual(ATLAS_NAMES.map((name) => atlasUrl(name)).sort());
  });

  it('fails when an atlas cannot be loaded', async () => {
    const failing = (): Promise<LoadedSheet> => Promise.reject(new Error('404'));
    await expect(loadSprites(failing)).rejects.toThrow('404');
  });

  it('draws the placeholder for a frame removed from the JSON', async () => {
    const placeholder = new Texture();
    const missing: string[] = [];
    const withoutTopSky = async (url: string): Promise<LoadedSheet> => {
      const sheet = await sheetFromCommittedJson(url);
      delete sheet.textures['sky/day/top'];
      return sheet;
    };
    const registry = await loadSprites(
      withoutTopSky,
      new SpriteRegistry(placeholder, (id) => missing.push(id)),
    );
    expect(registry.texture('sky/day/top')).toBe(placeholder);
    expect(missing).toEqual(['sky/day/top']);
  });
});
