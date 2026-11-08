import {
  CLOSED_DECISIONS_KEPT,
  DECISION_DEADLINE_STEPS,
  HELICOPTER_COST,
  type QueuedCommand,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { hashState } from '../hash';
import { createTower } from '../state';
import { step, type StepContext } from '../step';
import { endDisaster, openBombThreat, openFire } from './decisions';

const RANSOM = 300_000;
const FIRE_OPEN_STEP = 100;
const FIRE_DEADLINE_STEP = FIRE_OPEN_STEP + DECISION_DEADLINE_STEPS;

function withContext(state: TowerState): StepContext {
  return { state, events: [] };
}

function opened<T>(event: T | null): T {
  if (event === null) {
    throw new Error('Expected the decision to open');
  }
  return event;
}

function towerWithFire(): { state: TowerState; id: string } {
  const tower = createTower(1);
  tower.step = FIRE_OPEN_STEP;
  return { state: tower, id: opened(openFire(withContext(tower), 5)).id };
}

function towerWithBomb(): { state: TowerState; id: string } {
  const tower = createTower(1);
  return {
    state: tower,
    id: opened(openBombThreat(withContext(tower), RANSOM, { x: 0, level: 2 })).id,
  };
}

function answer(eventId: string, choice: string, id = 'c1'): QueuedCommand {
  return { id, command: { type: 'answerEvent', eventId, choice } };
}

describe('opening a decision', () => {
  it('takes an id from nextId, lists options with the default last and a deadline an hour on', () => {
    const tower = createTower(1);
    tower.step = 500;
    tower.nextId = 7;
    const context = withContext(tower);
    const fire = openFire(context, 5);
    expect(fire).toEqual({
      kind: 'fire',
      id: 'e7',
      startStep: 500,
      level: 5,
      levels: {},
      guards: {},
      decision: {
        openStep: 500,
        deadlineStep: 860,
        options: ['helicopter', 'burn'],
        defaultChoice: 'burn',
        choice: null,
      },
    });
    expect(tower.nextId).toBe(8);
    expect(context.events).toEqual([
      {
        type: 'decisionOpened',
        step: 500,
        eventId: 'e7',
        kind: 'fire',
        deadlineStep: 860,
        options: ['helicopter', 'burn'],
      },
    ]);
  });

  it('gives the bomb pay and refuse, refuse by default', () => {
    const { state } = towerWithBomb();
    expect(state.activeEvents[0]?.decision).toMatchObject({
      options: ['pay', 'refuse'],
      defaultChoice: 'refuse',
    });
  });

  it('keeps a single disaster active at a time', () => {
    const { state } = towerWithBomb();
    const context = withContext(state);
    expect(openFire(context, 5)).toBeNull();
    expect(openBombThreat(context, RANSOM, { x: 0, level: 2 })).toBeNull();
    expect(state.activeEvents).toHaveLength(1);
    expect(context.events).toEqual([]);
  });
});

describe('answerEvent', () => {
  it('accepts an answer at once, closes the decision and charges the helicopter', () => {
    const { state: tower, id } = towerWithFire();
    const { state, results, events } = step(tower, [answer(id, 'helicopter')], 0);
    expect(results).toEqual([
      { id: 'c1', ok: true, step: FIRE_OPEN_STEP, cost: HELICOPTER_COST, refund: 0 },
    ]);
    expect(events).toEqual([
      {
        type: 'decisionClosed',
        step: FIRE_OPEN_STEP,
        commandId: 'c1',
        eventId: id,
        choice: 'helicopter',
      },
    ]);
    expect(state.activeEvents[0]?.decision.choice).toBe('helicopter');
    expect(state.closedDecisions).toEqual([id]);
    expect(state.money).toBe(tower.money - HELICOPTER_COST);
    expect(state.ledger.currentWeek.events.expense).toBe(-HELICOPTER_COST);
  });

  it('accepts an answer one step before the deadline', () => {
    const { state: tower, id } = towerWithFire();
    const late = step(tower, [], DECISION_DEADLINE_STEPS - 1).state;
    expect(step(late, [answer(id, 'burn')], 0).results[0]).toMatchObject({ ok: true });
  });

  it('rejects an answer at the deadline step with EVENT_EXPIRED', () => {
    const { state: tower, id } = towerWithFire();
    const due = step(tower, [], DECISION_DEADLINE_STEPS).state;
    expect(step(due, [answer(id, 'helicopter')], 0).results[0]).toMatchObject({
      ok: false,
      error: 'EVENT_EXPIRED',
    });
  });

  it('checks the deadline step itself, not only whether the deadline already ran', () => {
    const { state: tower, id } = towerWithFire();
    tower.step = FIRE_DEADLINE_STEP;
    expect(step(tower, [answer(id, 'helicopter')], 0).results[0]).toMatchObject({
      error: 'EVENT_EXPIRED',
    });
  });

  it('rejects a second answer to the same decision', () => {
    const { state: tower, id } = towerWithFire();
    const twice = [answer(id, 'burn'), answer(id, 'helicopter', 'c2')];
    const { state, results } = step(tower, twice, 0);
    expect(results[1]).toMatchObject({ ok: false, error: 'EVENT_EXPIRED' });
    expect(state.money).toBe(tower.money);
  });

  it('rejects a choice the decision does not offer', () => {
    const { state: tower, id } = towerWithFire();
    const { state, results } = step(tower, [answer(id, 'pay')], 0);
    expect(results[0]).toMatchObject({ ok: false, error: 'INVALID_CHOICE' });
    expect(state.activeEvents[0]?.decision.choice).toBeNull();
  });

  it('rejects an id that is neither open nor recently closed', () => {
    const { state: tower } = towerWithFire();
    expect(step(tower, [answer('e999', 'burn')], 0).results[0]).toMatchObject({
      error: 'UNKNOWN_ENTITY',
    });
  });

  it('reports an unknown or expired id before a bad choice', () => {
    const { state: tower, id } = towerWithFire();
    const closed = step(tower, [answer(id, 'burn')], 0).state;
    const { results } = step(closed, [answer('e999', 'nope'), answer(id, 'nope', 'c2')], 0);
    expect(results.map((result) => (result.ok ? 'ok' : result.error))).toEqual([
      'UNKNOWN_ENTITY',
      'EVENT_EXPIRED',
    ]);
  });

  it('rejects a malformed command', () => {
    const command = { type: 'answerEvent', eventId: 3, choice: 'pay' } as never;
    expect(step(createTower(1), [{ id: 'c1', command }], 0).results[0]).toMatchObject({
      error: 'INVALID_COMMAND',
    });
  });

  it.each([0, -50_000])('lets the ransom be paid with a balance of %i', (balance) => {
    const { state: tower, id } = towerWithBomb();
    tower.money = balance;
    const { state, results } = step(tower, [answer(id, 'pay')], 0);
    expect(results[0]).toMatchObject({ ok: true, cost: RANSOM });
    expect(state.money).toBe(balance - RANSOM);
    expect(state.ledger.currentWeek.events.expense).toBe(-RANSOM);
  });

  it('charges nothing for refuse', () => {
    const { state: tower, id } = towerWithBomb();
    const { state, results } = step(tower, [answer(id, 'refuse')], 0);
    expect(results[0]).toMatchObject({ ok: true, cost: 0 });
    expect(state.money).toBe(tower.money);
  });
});

describe('decision deadline', () => {
  it('closes with the default at the deadline and posts the default notice', () => {
    const { state: tower, id } = towerWithFire();
    const { state, events } = step(tower, [], DECISION_DEADLINE_STEPS);
    expect(events).toEqual([
      { type: 'decisionClosed', step: FIRE_DEADLINE_STEP, eventId: id, choice: 'burn' },
      {
        type: 'news',
        step: FIRE_DEADLINE_STEP,
        key: 'news.decisionDefault',
        eventId: id,
        choice: 'burn',
      },
    ]);
    expect(state.activeEvents[0]?.decision.choice).toBe('burn');
    expect(state.closedDecisions).toEqual([id]);
    expect(state.money).toBe(tower.money);
  });

  it('does nothing one step before the deadline', () => {
    const { state: tower } = towerWithFire();
    const { state, events } = step(tower, [], DECISION_DEADLINE_STEPS - 1);
    expect(events).toEqual([]);
    expect(state.activeEvents[0]?.decision.choice).toBeNull();
  });

  it('leaves an answered decision alone', () => {
    const { state: tower, id } = towerWithFire();
    const { state, events } = step(tower, [answer(id, 'helicopter')], DECISION_DEADLINE_STEPS);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ commandId: 'c1', choice: 'helicopter' });
    expect(state.closedDecisions).toEqual([id]);
  });

  it('does not move while the tower is paused', () => {
    const { state: tower, id } = towerWithFire();
    let paused = tower;
    for (let poll = 0; poll < 5; poll++) {
      paused = step(paused, [], 0).state;
    }
    expect(paused.step).toBe(FIRE_OPEN_STEP);
    expect(paused.activeEvents[0]?.decision.deadlineStep).toBe(FIRE_DEADLINE_STEP);
    const resumed = step(paused, [], DECISION_DEADLINE_STEPS - 1).state;
    expect(step(resumed, [answer(id, 'burn')], 0).results[0]).toMatchObject({ ok: true });
  });
});

describe('a disaster that ends first', () => {
  it('closes the open decision with its default, at no cost and without the default notice', () => {
    const { state: tower, id } = towerWithFire();
    const money = tower.money;
    const context = withContext(tower);
    endDisaster(context, id);
    expect(context.events).toEqual([
      { type: 'decisionClosed', step: FIRE_OPEN_STEP, eventId: id, choice: 'burn' },
    ]);
    expect(tower.activeEvents).toEqual([]);
    expect(tower.closedDecisions).toEqual([id]);
    expect(tower.money).toBe(money);
  });

  it('only removes the event when its decision was already answered', () => {
    const { state: tower, id } = towerWithFire();
    const answered = step(tower, [answer(id, 'burn')], 0).state;
    const context = withContext(answered);
    endDisaster(context, id);
    expect(context.events).toEqual([]);
    expect(answered.activeEvents).toEqual([]);
    expect(answered.closedDecisions).toEqual([id]);
  });

  it('frees the slot for the next disaster', () => {
    const { state: tower, id } = towerWithFire();
    endDisaster(withContext(tower), id);
    expect(openBombThreat(withContext(tower), RANSOM, { x: 0, level: 2 })).not.toBeNull();
  });
});

describe('closed decisions', () => {
  function closeDecisions(count: number): { state: TowerState; ids: string[] } {
    let tower = createTower(1);
    const ids: string[] = [];
    for (let index = 0; index < count; index++) {
      const fire = opened(openFire(withContext(tower), 5));
      ids.push(fire.id);
      tower = step(tower, [answer(fire.id, 'burn')], 0).state;
      endDisaster(withContext(tower), fire.id);
    }
    return { state: tower, ids };
  }

  it('keeps the last ones, newest last, and an answer to them has expired', () => {
    const { state, ids } = closeDecisions(CLOSED_DECISIONS_KEPT);
    expect(state.closedDecisions).toEqual(ids);
    expect(
      step(state, [answer(state.closedDecisions[0] ?? '', 'burn')], 0).results[0],
    ).toMatchObject({
      error: 'EVENT_EXPIRED',
    });
  });

  it('drops the oldest when one more closes, and that id is then unknown', () => {
    const { state, ids } = closeDecisions(CLOSED_DECISIONS_KEPT + 1);
    const [oldest, ...kept] = ids;
    expect(state.closedDecisions).toEqual(kept);
    expect(step(state, [answer(oldest ?? '', 'burn')], 0).results[0]).toMatchObject({
      error: 'UNKNOWN_ENTITY',
    });
  });
});

describe('determinism', () => {
  it('gives the same ids, events and state for the same seed and commands', () => {
    function play() {
      const tower = createTower(42);
      const context = withContext(tower);
      const fire = opened(openFire(context, 5));
      const answered = step(tower, [answer(fire.id, 'helicopter')], 10);
      endDisaster(withContext(answered.state), fire.id);
      const bomb = opened(openBombThreat(withContext(answered.state), RANSOM, { x: 0, level: 2 }));
      const run = step(answered.state, [], DECISION_DEADLINE_STEPS);
      return { ids: [fire.id, bomb.id], events: run.events, hash: hashState(run.state) };
    }
    expect(play()).toEqual(play());
    expect(play().ids).toEqual(['e1', 'e2']);
  });
});
