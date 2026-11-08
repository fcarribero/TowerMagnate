import { describe, expect, it } from 'vitest';
import { PixelCanvas } from '../src/canvas.mjs';
import { atlasManifestSource } from '../src/manifest.mjs';

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
});
