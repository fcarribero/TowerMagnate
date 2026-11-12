import type { QueuedCommand } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { hashState } from './hash';
import { chargeMoney } from './money';
import { deserializeState, serializeState } from './serialization';
import { createTower } from './state';
import { createEngine } from './step';

const RANSOM = 150;
const GAP_STEPS = 360;

const engine = createEngine({
  commandHandlers: {
    answerEvent: (context) => {
      chargeMoney(context.state, 'events', RANSOM);
      return { ok: true, cost: RANSOM, refund: 0, events: [] };
    },
  },
  systems: [],
});

const ransom = (id: string): QueuedCommand => ({
  id,
  command: { type: 'answerEvent', eventId: 'e1', choice: 'pay' },
});

function balanceNews(events: readonly { type: string }[]) {
  return events.filter(
    (event) => event.type === 'news' && 'key' in event && event.key === 'news.balanceNegative',
  );
}

describe('balance negative notice', () => {
  it('reports the first entry that takes the balance below zero and no later one', () => {
    const tower = { ...createTower(5), money: 100 };
    const first = engine.step(tower, [ransom('c1')], 1);
    expect(first.state.money).toBe(-50);
    expect(balanceNews(first.events)).toHaveLength(1);
    const second = engine.step(first.state, [ransom('c2')], 10);
    expect(second.state.money).toBe(-200);
    expect(balanceNews(second.events)).toHaveLength(0);
  });

  it('reports again when the balance recovers and goes negative after 360 steps', () => {
    const first = engine.step({ ...createTower(5), money: 100 }, [ransom('c1')], 1);
    const recovered = { ...first.state, money: 100 };
    const early = engine.step(recovered, [ransom('c2')], 1);
    expect(balanceNews(early.events)).toHaveLength(0);
    const idle = engine.step(recovered, [], GAP_STEPS);
    const again = engine.step({ ...idle.state, money: 100 }, [ransom('c3')], 1);
    expect(balanceNews(again.events)).toHaveLength(1);
  });

  it('gives the same log after a save and restore between two events', () => {
    const first = engine.step({ ...createTower(5), money: 100 }, [ransom('c1')], 1);
    const restored = deserializeState(serializeState(first.state));
    const next = (state: typeof first.state) =>
      engine.step({ ...state, money: 100 }, [ransom('c2')], GAP_STEPS + 1);
    const live = next(first.state);
    const reloaded = next(restored);
    expect(reloaded.events).toEqual(live.events);
    expect(hashState(reloaded.state)).toBe(hashState(live.state));
  });
});
