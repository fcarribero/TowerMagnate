// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OFFICE_CATALOG } from './officeCatalog';

const atlas = JSON.parse(
  readFileSync(new URL('../../../../assets/atlases/office.json', import.meta.url), 'utf8'),
) as { frames: Record<string, { sourceSize: { w: number; h: number } }> };

describe('office catalog', () => {
  it('matches the size of every drawn prop, busy look included', () => {
    for (const entry of OFFICE_CATALOG) {
      const looks = entry.busy ? ['idle', 'busy'] : ['idle'];
      for (const look of looks) {
        const frame = atlas.frames[`office/${entry.kind}/${look}`];
        expect(frame, `${entry.kind}/${look}`).toBeDefined();
        expect([frame?.sourceSize.w, frame?.sourceSize.h], entry.kind).toEqual([
          entry.width,
          entry.height,
        ]);
      }
    }
  });

  it('lists every drawn prop', () => {
    const drawn = new Set(
      Object.keys(atlas.frames)
        .filter((id) => !id.startsWith('office/curtains/'))
        .map((id) => id.split('/')[1]),
    );
    expect([...drawn].sort()).toEqual(OFFICE_CATALOG.map((entry) => entry.kind).sort());
  });
});
