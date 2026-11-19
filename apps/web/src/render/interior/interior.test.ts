// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONDO_INTERIOR,
  INTERIOR_SPECS,
  generateInteriorLayout,
  interiorKind,
  interiorTemplate,
  rectsAround,
  type InteriorProp,
  type InteriorSpec,
} from './index';

interface AtlasJson {
  frames: Record<string, { sourceSize: { w: number; h: number } }>;
}

function atlas(group: string): AtlasJson {
  const url = new URL(`../../../../../assets/atlases/${group}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as AtlasJson;
}

const SEEDS = Array.from({ length: 300 }, (_, i) => (i * 2654435761) >>> 0);

function overlap(a: Rectish, b: Rectish): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
type Rectish = Pick<InteriorProp, 'x' | 'y' | 'width' | 'height'>;

describe.each(Object.values(INTERIOR_SPECS))('$unitType interior', (spec: InteriorSpec) => {
  const frames = atlas(spec.group).frames;

  it('matches the size of every drawn prop in every look', () => {
    for (const entry of spec.catalog) {
      for (const look of ['idle', ...(entry.looks ?? [])]) {
        const frame = frames[`${spec.group}/${entry.kind}/${look}`];
        expect(frame, `${entry.kind}/${look}`).toBeDefined();
        expect([frame?.sourceSize.w, frame?.sourceSize.h], entry.kind).toEqual([
          entry.width,
          entry.height,
        ]);
      }
    }
  });

  it('lists every drawn prop and has curtains', () => {
    const drawn = new Set(
      Object.keys(frames)
        .filter((id) => !id.startsWith(`${spec.group}/curtains/`))
        .map((id) => id.split('/')[1]),
    );
    expect([...drawn].sort()).toEqual(spec.catalog.map((entry) => entry.kind).sort());
    expect(frames[`${spec.group}/curtains/open`]).toBeDefined();
    expect(frames[`${spec.group}/curtains/closed`]).toBeDefined();
  });

  it('gives the same layout for the same seed and different ones for different seeds', () => {
    for (const template of spec.templates) {
      expect(generateInteriorLayout(spec, 1234, template)).toEqual(
        generateInteriorLayout(spec, 1234, template),
      );
    }
    const layouts = new Set(
      SEEDS.map((seed) => JSON.stringify(generateInteriorLayout(spec, seed).props)),
    );
    expect(layouts.size).toBeGreaterThan(SEEDS.length * 0.9);
  });

  it('keeps props inside their zones, apart within a layer and off the windows', () => {
    for (const template of spec.templates) {
      for (const seed of SEEDS) {
        const { props } = generateInteriorLayout(spec, seed, template);
        for (const prop of props) {
          const entry = interiorKind(spec, prop.kind);
          const zone = spec.zones.find(
            (area) => prop.x >= area.left && prop.x + prop.width - 1 <= area.right,
          );
          expect(zone, `${seed} ${prop.kind} at ${prop.x}`).toBeDefined();
          if (entry.zones && zone) expect(entry.zones).toContain(zone.id);
          expect(prop.y).toBeGreaterThanOrEqual(spec.room.wallTop);
          if (prop.layer === 0) {
            for (const glass of spec.windows) {
              const window = {
                x: glass.left,
                y: glass.top,
                width: glass.width,
                height: glass.height,
              };
              expect(overlap(prop, window), `${seed} ${prop.kind}`).toBe(false);
            }
          }
          for (const other of props) {
            if (other !== prop && other.layer === prop.layer) {
              expect(overlap(prop, other), `${seed} ${prop.kind} ${other.kind}`).toBe(false);
            }
          }
        }
        const counts = new Map<string, number>();
        props.forEach((prop) => counts.set(prop.kind, (counts.get(prop.kind) ?? 0) + 1));
        for (const [kind, count] of counts) {
          expect(count).toBeLessThanOrEqual(interiorKind(spec, kind).max);
        }
      }
    }
  });

  it('keeps the fixed props of each template where it puts them', () => {
    for (const template of spec.templates) {
      const { props } = generateInteriorLayout(spec, 99, template);
      const fixed = props.filter((prop) => prop.fixed).map(({ kind, x }) => ({ kind, x }));
      expect(fixed.sort((a, b) => a.x - b.x)).toEqual(
        template.fixed.map(({ kind, x }) => ({ kind, x })).sort((a, b) => a.x - b.x),
      );
    }
  });

  it('has a look, curtains and shade for every state', () => {
    for (const state of spec.states) {
      expect(spec.propLook).toHaveProperty(state);
      expect(spec.curtains).toHaveProperty(state);
      expect(spec.shade[state]).toBeDefined();
    }
  });
});

describe('condo interior', () => {
  it('always has a kitchen in the living room and a bed in the bedroom', () => {
    for (const seed of SEEDS) {
      const { props } = generateInteriorLayout(CONDO_INTERIOR, seed);
      const kitchen = props.find((prop) => prop.kind === 'kitchen');
      const bed = props.find((prop) => prop.kind === 'bed');
      expect(kitchen?.x, `${seed}`).toBeLessThan(84);
      expect(bed?.x, `${seed}`).toBeGreaterThan(86);
    }
  });

  it('keeps the classic template as the old condo', () => {
    const classic = interiorTemplate(CONDO_INTERIOR, 'classic');
    expect(generateInteriorLayout(CONDO_INTERIOR, 5, classic).props).toHaveLength(7);
  });
});

describe('rectsAround', () => {
  it('covers the room except the holes', () => {
    const room = { x: 0, y: 0, width: 10, height: 6 };
    const rects = rectsAround(room, [{ x: 2, y: 1, width: 3, height: 2 }]);
    const area = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
    expect(area).toBe(60 - 6);
  });
});
