import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { PixelCanvas } from '../src/canvas.mjs';
import { groups } from '../src/groups/index.mjs';
import { atlasManifestSource } from '../src/manifest.mjs';

const committedManifest = fileURLToPath(
  new URL('../../../apps/web/src/render/atlasManifest.ts', import.meta.url),
);

function drawn(name, ids) {
  return { name, sprites: ids.map((id) => ({ id, canvas: new PixelCanvas(1, 1) })) };
}

describe('atlas manifest', () => {
  it('lists atlas names and sprite ids sorted, whatever the group order', () => {
    const source = atlasManifestSource([
      drawn('structure', ['structure/floor/day']),
      drawn('sky', ['sky/day/top', 'sky/day/horizon']),
    ]);
    expect(source).toContain("export const ATLAS_NAMES = ['sky', 'structure'] as const;");
    expect(source).toContain(
      "export const SPRITE_IDS = ['sky/day/horizon', 'sky/day/top', 'structure/floor/day'] as const;",
    );
  });

  it('breaks a long list into one id per line', () => {
    const ids = Array.from({ length: 8 }, (_, index) => `units/office/occupied_day_${index}`);
    const source = atlasManifestSource([drawn('units', ids)]);
    expect(source).toContain("export const SPRITE_IDS = [\n  'units/office/occupied_day_0',\n");
    expect(source).toContain("  'units/office/occupied_day_7',\n] as const;");
  });

  it('matches the committed client manifest, so nobody forgets to rebuild', () => {
    const committed = readFileSync(committedManifest, 'utf8');
    expect(committed, 'atlasManifest.ts is stale, run pnpm art:build').toBe(
      atlasManifestSource(drawGroups(groups)),
    );
  });
});
