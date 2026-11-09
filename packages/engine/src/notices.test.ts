import { NOTICES_KEPT, type EngineEvent } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { openFire } from './events';
import { recordNotices } from './notices';
import { step } from './step';
import { createTower } from './state';

const news = (step: number, key: string, unitId: string | null = null): EngineEvent => ({
  type: 'news',
  step,
  key,
  unitId,
  params: {},
});

describe('recordNotices', () => {
  it('keeps the news of a step with its unit and game time', () => {
    const tower = createTower(1);
    recordNotices(tower, [news(40, 'news.officeLeft', 'u3'), news(40, 'news.starsUp')]);
    expect(tower.notices).toEqual([
      { id: 'n40.0', step: 40, key: 'news.officeLeft', unitId: 'u3', params: {} },
      { id: 'n40.1', step: 40, key: 'news.starsUp', unitId: null, params: {} },
    ]);
  });

  it('keeps the level, amount and star count a news text fills in', () => {
    const tower = createTower(1);
    recordNotices(tower, [
      { type: 'news', step: 7, key: 'news.bombExploded', unitId: null, params: { level: 7 } },
      {
        type: 'news',
        step: 7,
        commandId: 'c1',
        key: 'news.treasure',
        unitId: null,
        params: { level: -3, amount: 50_000 },
      },
      { type: 'news', step: 7, key: 'news.starsUp', unitId: null, params: { n: 3 } },
    ]);
    expect(tower.notices.map((notice) => notice.params)).toEqual([
      { level: 7 },
      { level: -3, amount: 50_000 },
      { n: 3 },
    ]);
  });

  it('gives the default-decision news no unit and ignores other events', () => {
    const tower = createTower(1);
    recordNotices(tower, [
      {
        type: 'news',
        step: 9,
        key: 'news.decisionDefault',
        unitId: null,
        params: { option: 'burn' },
      },
      { type: 'leaseSigned', step: 9, unitId: 'u1' },
    ]);
    expect(tower.notices).toEqual([
      {
        id: 'n9.0',
        step: 9,
        key: 'news.decisionDefault',
        unitId: null,
        params: { option: 'burn' },
      },
    ]);
  });

  it('keeps only the last notices', () => {
    const tower = createTower(1);
    const events = Array.from({ length: NOTICES_KEPT + 5 }, (_, index) => news(index, 'news.x'));
    recordNotices(tower, events);
    expect(tower.notices).toHaveLength(NOTICES_KEPT);
    expect(tower.notices[0]?.step).toBe(5);
    expect(tower.notices.at(-1)?.step).toBe(NOTICES_KEPT + 4);
  });
});

describe('notices from a running tower', () => {
  it('records the news of a decision that timed out', () => {
    const tower = createTower(1);
    openFire({ state: tower, events: [] }, 4);
    const { state } = step(tower, [], 400);
    expect(state.notices).toEqual([
      {
        id: 'n360.0',
        step: 360,
        key: 'news.decisionDefault',
        unitId: null,
        params: { option: 'burn' },
      },
    ]);
  });
});
