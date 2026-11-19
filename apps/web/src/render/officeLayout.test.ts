import { describe, expect, it } from 'vitest';
import { officeKind } from './officeCatalog';
import {
  OFFICE_ROOM,
  OFFICE_TEMPLATES,
  OFFICE_WINDOWS,
  generateOfficeLayout,
  officeTemplate,
  type OfficeProp,
} from './officeLayout';

const SEEDS = Array.from({ length: 300 }, (_, i) => (i * 2654435761) >>> 0);

function overlap(a: OfficeProp, b: OfficeProp): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('generateOfficeLayout', () => {
  it('gives the same layout for the same seed and template', () => {
    for (const template of OFFICE_TEMPLATES) {
      expect(generateOfficeLayout(1234, template)).toEqual(generateOfficeLayout(1234, template));
    }
  });

  it('gives different layouts for different seeds', () => {
    const layouts = new Set(SEEDS.map((seed) => JSON.stringify(generateOfficeLayout(seed).props)));
    expect(layouts.size).toBeGreaterThan(SEEDS.length * 0.9);
  });

  it('keeps props inside the room, apart within a layer and off the windows', () => {
    for (const seed of SEEDS) {
      const { props } = generateOfficeLayout(seed);
      for (const prop of props) {
        expect(prop.x).toBeGreaterThanOrEqual(OFFICE_ROOM.innerLeft);
        expect(prop.x + prop.width - 1).toBeLessThanOrEqual(OFFICE_ROOM.innerRight);
        expect(prop.y).toBeGreaterThanOrEqual(OFFICE_ROOM.wallTop);
        if (prop.layer === 0) {
          for (const window of OFFICE_WINDOWS) {
            const glass = { ...window, x: window.left, y: window.top } as unknown as OfficeProp;
            expect(overlap(prop, glass), `${seed} ${prop.kind}`).toBe(false);
          }
        }
        for (const other of props) {
          if (other !== prop && other.layer === prop.layer) {
            expect(overlap(prop, other), `${seed} ${prop.kind} ${other.kind}`).toBe(false);
          }
        }
      }
    }
  });

  it('respects the catalog limits and always has a workstation', () => {
    for (const seed of SEEDS) {
      const { props } = generateOfficeLayout(seed);
      expect(props.some((prop) => officeKind(prop.kind).workstation)).toBe(true);
      const counts = new Map<string, number>();
      props.forEach((prop) => counts.set(prop.kind, (counts.get(prop.kind) ?? 0) + 1));
      for (const [kind, count] of counts) {
        expect(count).toBeLessThanOrEqual(officeKind(kind).max);
      }
    }
  });

  it('keeps the fixed props of a template where the template puts them', () => {
    const classic = officeTemplate('classic');
    for (const seed of SEEDS.slice(0, 20)) {
      const { props } = generateOfficeLayout(seed, classic);
      expect(props.map(({ kind, x }) => ({ kind, x })).sort((a, b) => a.x - b.x)).toEqual(
        classic.fixed.map(({ kind, x }) => ({ kind, x })).sort((a, b) => a.x - b.x),
      );
    }
    const mixed = officeTemplate('mixed');
    const { props } = generateOfficeLayout(99, mixed);
    expect(props.filter((prop) => prop.fixed)).toHaveLength(mixed.fixed.length);
  });
});
