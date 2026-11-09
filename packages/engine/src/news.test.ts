import type { TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_DAY } from './clock';
import { hashState } from './hash';
import { chargeMoney } from './money';
import { emitNews } from './news';
import { deserializeState, serializeState } from './serialization';
import { cloneState, createTower } from './state';
import { createEngine } from './step';

const GAP = 360;

function towerAt(step: number): TowerState {
  return { ...createTower(7), step };
}

describe('emitNews', () => {
  it('reports the key, unit and params and remembers the step', () => {
    const tower = towerAt(500);
    expect(emitNews(tower, 'news.treasure', { params: { level: -3, amount: 50_000 } })).toEqual([
      {
        type: 'news',
        step: 500,
        key: 'news.treasure',
        unitId: null,
        params: { level: -3, amount: 50_000 },
      },
    ]);
    expect(emitNews(tower, 'news.officeLeft', { unitId: 'u4' })[0]?.unitId).toBe('u4');
    expect(tower.newsSent).toEqual({
      'news.treasure|level:-3': 500,
      'news.officeLeft|unit:u4': 500,
    });
  });

  it('drops the same key and unit within 359 steps and sends it at 360', () => {
    const tower = towerAt(1_000);
    emitNews(tower, 'news.officeLeft', { unitId: 'u4' });
    tower.step += GAP - 1;
    expect(emitNews(tower, 'news.officeLeft', { unitId: 'u4' })).toEqual([]);
    expect(emitNews(tower, 'news.officeLeft', { unitId: 'u5' })).toHaveLength(1);
    tower.step += 1;
    expect(emitNews(tower, 'news.officeLeft', { unitId: 'u4' })).toHaveLength(1);
  });

  it('scopes level keys by the level param', () => {
    const tower = towerAt(1_000);
    emitNews(tower, 'news.cockroaches', { params: { level: 12 } });
    tower.step += 10;
    expect(emitNews(tower, 'news.cockroaches', { params: { level: 12 } })).toEqual([]);
    expect(emitNews(tower, 'news.cockroaches', { params: { level: 13 } })).toHaveLength(1);
  });

  it('scopes event keys by event id', () => {
    const tower = towerAt(1_000);
    emitNews(tower, 'news.bombThreat', { eventId: 'e1' });
    expect(emitNews(tower, 'news.bombThreat', { eventId: 'e1' })).toEqual([]);
    expect(emitNews(tower, 'news.bombThreat', { eventId: 'e2' })).toHaveLength(1);
  });

  it('sends a daily key once per game day from 00:00', () => {
    const tower = towerAt(5_000);
    emitNews(tower, 'news.medicalFull');
    tower.step = STEPS_PER_DAY - 1;
    expect(emitNews(tower, 'news.medicalFull')).toEqual([]);
    tower.step = STEPS_PER_DAY;
    expect(emitNews(tower, 'news.medicalFull')).toHaveLength(1);
  });

  it('leaves the state and ledger unchanged when it drops a notice', () => {
    const tower = towerAt(1_000);
    emitNews(tower, 'news.balanceNegative');
    tower.step += 10;
    const before = cloneState(tower);
    expect(emitNews(tower, 'news.balanceNegative')).toEqual([]);
    expect(tower).toEqual(before);
    expect(tower.ledger).toEqual(before.ledger);
  });

  it('forgets slots older than a day when it sends', () => {
    const tower = towerAt(100);
    emitNews(tower, 'news.officeLeft', { unitId: 'u4' });
    tower.step += STEPS_PER_DAY;
    emitNews(tower, 'news.santa');
    expect(tower.newsSent).toEqual({ 'news.santa|tower': 100 + STEPS_PER_DAY });
  });
});

const CHARGE = 30_000;

/** Charges $30,000 every 10 steps and reports when the balance goes below $0, then refills it. */
const drainingEngine = createEngine({
  commandHandlers: {},
  systems: [
    (context) => {
      const { state } = context;
      if (state.step % 10 !== 0) return;
      const before = state.money;
      chargeMoney(state, 'events', CHARGE);
      if (before >= 0 && state.money < 0) {
        context.events.push(...emitNews(state, 'news.balanceNegative'));
      }
      if (state.money < 0) state.money = 0;
    },
  ],
});

function drainingTower(): TowerState {
  return { ...createTower(11), money: CHARGE - 1 };
}

function balanceNews(state: TowerState): number {
  return state.notices.filter((notice) => notice.key === 'news.balanceNegative').length;
}

describe('news rate limit across steps and saves', () => {
  it('sends one balance notice for two drains 10 steps apart and another 360 steps later', () => {
    const first = drainingEngine.step(drainingTower(), [], 20);
    expect(balanceNews(first.state)).toBe(1);
    const later = drainingEngine.step(first.state, [], GAP);
    expect(balanceNews(later.state)).toBe(2);
  });

  it('rate-limits the same after a save and restore', () => {
    const first = drainingEngine.step(drainingTower(), [], 15);
    const restored = deserializeState(serializeState(first.state));
    const live = drainingEngine.step(first.state, [], 5 + GAP);
    const reloaded = drainingEngine.step(restored, [], 5 + GAP);
    expect(balanceNews(reloaded.state)).toBe(2);
    expect(hashState(reloaded.state)).toBe(hashState(live.state));
  });

  it('gives the same state hash after 1,000 steps from a restored snapshot', () => {
    const start = drainingEngine.step(drainingTower(), [], 25);
    const restored = deserializeState(serializeState(start.state));
    const live = drainingEngine.step(start.state, [], 1_000);
    const reloaded = drainingEngine.step(restored, [], 1_000);
    expect(restored.newsSent).toEqual(start.state.newsSent);
    expect(hashState(reloaded.state)).toBe(hashState(live.state));
  });
});
