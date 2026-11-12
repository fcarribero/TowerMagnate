import type { ClientEvent, EventView, FireSpan } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { SPRITE_IDS } from './atlasManifest';
import {
  BLAST_MS,
  HELICOPTER_CROSSING_MS,
  SANTA_CROSSING_MS,
  WATER_DROP_MS,
  TransientEffects,
  fireSpansOf,
  frameAt,
  planBlast,
  planCathedral,
  planFire,
  planHelicopter,
  planRoaches,
  planSanta,
  waterDropStartMs,
  waterTargetOf,
  weddingOf,
} from './eventPlan';
import { WORLD_WIDTH } from './levels';
import { TILE_WIDTH } from './metrics';

const span = (level: number, x0: number, x1: number, out = false): FireSpan => ({
  level,
  x0,
  x1,
  out,
});

function expectKnownSprites(ids: readonly string[]): void {
  for (const id of ids) {
    expect(SPRITE_IDS as readonly string[]).toContain(id);
  }
}

describe('fire', () => {
  it('reads spans from the decision and the disaster view', () => {
    const events: EventView[] = [
      {
        kind: 'decision',
        id: 'e1',
        decision: 'fire',
        deadlineStep: 9,
        options: ['burn'],
        spans: [span(5, 3, 4)],
      },
      { kind: 'disaster', id: 'e2', disaster: 'fire', cells: [], spans: [span(6, 1, 1)] },
      { kind: 'disaster', id: 'e3', disaster: 'bomb', cells: [] },
    ];
    expect(fireSpansOf(events)).toEqual([span(5, 3, 4), span(6, 1, 1)]);
  });

  it('draws a flame on every column of a span and a front on each side', () => {
    const drawings = planFire([span(5, 10, 12)]);
    const flames = drawings.filter((drawing) => drawing.key.startsWith('flame:'));
    const fronts = drawings.filter((drawing) => drawing.key.startsWith('front:'));
    expect(flames.map((drawing) => drawing.x)).toEqual([10, 11, 12].map((c) => c * TILE_WIDTH));
    expect(fronts.map((drawing) => drawing.x)).toEqual([9, 13].map((c) => c * TILE_WIDTH));
  });

  it('draws one more flame for every column the span grows', () => {
    const flames = (spans: FireSpan[]) =>
      planFire(spans).filter((drawing) => drawing.key.startsWith('flame:'));
    expect(flames([span(5, 10, 12)])).toHaveLength(3);
    expect(flames([span(5, 10, 13)])).toHaveLength(4);
  });

  it('draws no front past the edges of the tower', () => {
    const fronts = planFire([span(5, 0, 374)]).filter((d) => d.key.startsWith('front:'));
    expect(fronts).toHaveLength(0);
  });

  it('draws smoke instead of flames once a span is out', () => {
    const drawings = planFire([span(5, 10, 11, true)]);
    expect(drawings.map((drawing) => drawing.key)).toEqual(['smoke:5:10', 'smoke:5:11']);
  });

  it('draws nothing when no span is left', () => {
    expect(planFire([])).toEqual([]);
  });

  it('uses sprites that are in the atlas', () => {
    expectKnownSprites(planFire([span(5, 1, 2), span(6, 1, 2, true)]).flatMap((d) => d.frames));
  });

  it('cycles frames with time and offsets neighbours', () => {
    const [first, second] = planFire([span(5, 10, 11)]);
    if (first === undefined || second === undefined) {
      throw new Error('Expected two flames');
    }
    expect(frameAt(first, 0)).not.toBe(frameAt(second, 0));
    expect(frameAt(first, 0)).not.toBe(frameAt(first, first.frameMs));
  });
});

describe('infestation', () => {
  it('puts roaches only on infested rooms', () => {
    const units = [
      { id: 'u1', type: 'single-room', x: 4, level: 3, variant: 'infested' },
      { id: 'u2', type: 'single-room', x: 8, level: 3, variant: 'dirty' },
    ] as const;
    const drawings = planRoaches(units);
    expect(drawings).toHaveLength(3);
    expect(new Set(drawings.map((drawing) => drawing.key.split(':')[1]))).toEqual(new Set(['u1']));
    expect(drawings.every((drawing) => drawing.level === 3)).toBe(true);
    expectKnownSprites(drawings.flatMap((drawing) => drawing.frames));
  });
});

describe('wedding', () => {
  const wedding: EventView = { kind: 'wedding', cathedral: 'u7', guests: ['p1', 'p2'] };

  it('is only there while the event view is', () => {
    expect(weddingOf([])).toBeNull();
    expect(weddingOf([wedding])).toEqual({ cathedral: 'u7', guests: new Set(['p1', 'p2']) });
  });

  it('hangs the bell over the cathedral', () => {
    const units = new Map([
      ['u7', { id: 'u7', type: 'cathedral', x: 20, level: 2, variant: 'occupied' } as const],
    ]);
    const [bell] = planCathedral('u7', units);
    expect(bell?.key).toBe('bell:u7');
    expect(bell?.x).toBeGreaterThanOrEqual(20 * TILE_WIDTH);
    expectKnownSprites(bell?.frames ?? []);
  });

  it('draws nothing when the cathedral is unknown', () => {
    expect(planCathedral('u7', new Map())).toEqual([]);
  });
});

describe('transient effects', () => {
  const bomb: ClientEvent = {
    type: 'disaster',
    step: 3,
    kind: 'bomb',
    cells: [{ level: -9, x0: 0, x1: 7 }],
  };
  const news = (key: string, step: number): ClientEvent => ({
    type: 'news',
    step,
    key,
    unitId: null,
    params: {},
  });

  it('starts a blast for the bomb disaster with ruined cells', () => {
    expect(new TransientEffects().receive([bomb])).toEqual([{ kind: 'blast', cells: bomb.cells }]);
  });

  it('ignores a disaster with no cells and a fire disaster', () => {
    const effects = new TransientEffects();
    expect(
      effects.receive([
        { ...bomb, cells: [] },
        { ...bomb, kind: 'fire' },
      ]),
    ).toEqual([]);
  });

  it('starts the helicopter when it closes a fire', () => {
    expect(new TransientEffects().receive([news('news.fireHelicopter', 4)])).toEqual([
      { kind: 'helicopter' },
    ]);
    expect(new TransientEffects().receive([news('news.fireOut', 4)])).toEqual([]);
  });

  it('starts Papa Noel once per notice step', () => {
    const effects = new TransientEffects();
    expect(effects.receive([news('news.santa', 10)])).toEqual([{ kind: 'santa' }]);
    expect(effects.receive([news('news.santa', 10)])).toEqual([]);
    expect(effects.receive([news('news.santa', 99)])).toEqual([{ kind: 'santa' }]);
  });
});

describe('blast', () => {
  const cells = [{ level: -9, x0: 0, x1: 7 }];

  it('covers each range with a sprite every four columns', () => {
    const placements = planBlast(cells, 0);
    expect(placements.map((placement) => placement.x)).toEqual([0, 4 * TILE_WIDTH]);
    expect(placements.every((placement) => placement.level === -9)).toBe(true);
    expectKnownSprites(placements.map((placement) => placement.sprite));
  });

  it('steps through the frames and ends', () => {
    expect(planBlast(cells, 0)[0]?.sprite).not.toBe(planBlast(cells, BLAST_MS - 1)[0]?.sprite);
    expect(planBlast(cells, BLAST_MS)).toEqual([]);
  });
});

describe('helicopter', () => {
  const target = waterTargetOf([span(5, 100, 107), span(8, 100, 103)]);
  if (target === null) {
    throw new Error('Expected a water target');
  }
  const keys = (elapsedMs: number) =>
    planHelicopter(elapsedMs, target, 10).map((placement) => placement.key);

  it('aims at the middle of the highest burning level', () => {
    expect(target.level).toBe(8);
    expect(waterTargetOf([])).toBeNull();
  });

  it('crosses right to left and leaves', () => {
    const start = planHelicopter(0, target, 10)[0];
    const later = planHelicopter(HELICOPTER_CROSSING_MS / 2, target, 10)[0];
    expect(start?.x).toBe(WORLD_WIDTH);
    expect(later?.x).toBeLessThan(WORLD_WIDTH);
    expect(planHelicopter(HELICOPTER_CROSSING_MS, target, 10)).toEqual([]);
  });

  it('drops water only while overhead', () => {
    const dropAt = waterDropStartMs(target);
    expect(keys(dropAt - 100)).toEqual(['helicopter']);
    expect(keys(dropAt + 100)).toEqual(['helicopter', 'water']);
    expect(keys(dropAt + WATER_DROP_MS + 100)).toEqual(['helicopter']);
  });

  it('flies without water when no fire was known', () => {
    expect(planHelicopter(1000, null, 10).map((placement) => placement.key)).toEqual([
      'helicopter',
    ]);
  });
});

describe('Papa Noel', () => {
  it('crosses from the right edge to the left edge in 20 seconds', () => {
    expect(planSanta(0, 10)[0]?.x).toBe(WORLD_WIDTH);
    expect(planSanta(SANTA_CROSSING_MS - 1, 10)[0]?.x).toBeLessThan(0);
    expect(planSanta(SANTA_CROSSING_MS, 10)).toEqual([]);
  });

  it('flies in the sky above the tower', () => {
    const low = planSanta(1000, 5)[0];
    const high = planSanta(1000, 20)[0];
    expect(low?.level).toBeNull();
    expect(high?.y).toBeLessThan(low?.y ?? 0);
  });
});
