import { describe, expect, it } from 'vitest';
import { planRooftopProps, ROOFTOP_KINDS } from './rooftopPlan';

const widthOf = (kind: string): number =>
  ROOFTOP_KINDS.find((entry) => entry.kind === kind)?.widthTiles ?? 0;

describe('planRooftopProps', () => {
  it('gives the same props for the same level and span', () => {
    const span = { from: 10, to: 60 };
    expect(planRooftopProps(7, span)).toEqual(planRooftopProps(7, span));
  });

  it('varies between levels', () => {
    const span = { from: 10, to: 80 };
    expect(planRooftopProps(3, span)).not.toEqual(planRooftopProps(4, span));
  });

  it('stays inside the span, off the end columns, and never overlaps', () => {
    for (let level = -3; level < 40; level += 1) {
      const span = { from: 5, to: 5 + (level + 10) * 3 };
      let nextFree = span.from + 1;
      for (const prop of planRooftopProps(level, span)) {
        expect(prop.widthTiles).toBe(widthOf(prop.kind));
        expect(prop.column).toBeGreaterThanOrEqual(nextFree);
        expect(prop.column + prop.widthTiles - 1).toBeLessThanOrEqual(span.to - 1);
        nextFree = prop.column + prop.widthTiles + 1;
      }
    }
  });

  it('puts nothing on a span too short to leave the end margins', () => {
    expect(planRooftopProps(5, { from: 4, to: 5 })).toEqual([]);
    expect(planRooftopProps(5, { from: 4, to: 4 })).toEqual([]);
  });

  it('uses only kinds that fit and several kinds on a wide roof', () => {
    const props = planRooftopProps(12, { from: 0, to: 200 });
    expect(new Set(props.map((prop) => prop.kind)).size).toBeGreaterThan(3);
    for (const prop of planRooftopProps(12, { from: 0, to: 3 })) {
      expect(prop.widthTiles).toBe(1);
    }
  });

  it('keeps the props over the left columns when the span grows to the right', () => {
    const short = planRooftopProps(9, { from: 20, to: 60 });
    const long = planRooftopProps(9, { from: 20, to: 90 });
    const stable = short.filter((prop) => prop.column + prop.widthTiles <= 55);
    expect(long.slice(0, stable.length)).toEqual(stable);
  });
});
