import { CLOSED_DECISIONS_KEPT, EventViewSchema } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { deserializeState, serializeState } from '../serialization';
import { createTower } from '../state';
import { answerDecision, openBombThreat, openFire } from './decisions';
import { buildEventViews } from './view';

const context = (state: ReturnType<typeof createTower>) => ({ state, events: [] });

describe('buildEventViews', () => {
  it('shows an open bomb decision with its ransom and without a cell', () => {
    const tower = createTower(1);
    openBombThreat(context(tower), 250_000, { x: 0, level: 2 });
    const [view] = buildEventViews(tower);
    expect(view).toEqual({
      kind: 'decision',
      id: 'e1',
      decision: 'bomb',
      deadlineStep: tower.activeEvents[0]?.decision.deadlineStep,
      options: ['pay', 'refuse'],
      ransom: 250_000,
    });
    expect(EventViewSchema.safeParse(view).success).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/cell|bomb":/);
  });

  it('shows an open fire decision with its level', () => {
    const tower = createTower(1);
    openFire(context(tower), 12);
    const [view] = buildEventViews(tower);
    expect(view).toMatchObject({ kind: 'decision', decision: 'fire', level: 12 });
    expect(view).not.toHaveProperty('ransom');
    expect(EventViewSchema.safeParse(view).success).toBe(true);
  });

  it('shows a fire as a disaster once its decision is closed', () => {
    const tower = createTower(1);
    const fire = openFire(context(tower), 5);
    answerDecision(tower, fire?.id ?? '', 'burn');
    expect(buildEventViews(tower)).toEqual([
      { kind: 'disaster', id: 'e1', disaster: 'fire', cells: [] },
    ]);
  });

  it('is empty without events', () => {
    expect(buildEventViews(createTower(1))).toEqual([]);
  });
});

describe('event state in saved snapshots', () => {
  it('keeps the deadline of an open decision and lets the player answer after restore', () => {
    const tower = createTower(1);
    openBombThreat(context(tower), 250_000, { x: 0, level: 2 });
    const deadline = tower.activeEvents[0]?.decision.deadlineStep;
    const restored = deserializeState(serializeState(tower));
    expect(restored.activeEvents[0]?.decision.deadlineStep).toBe(deadline);
    expect(buildEventViews(restored)).toEqual(buildEventViews(tower));
    expect(answerDecision(restored, 'e1', 'refuse')).toEqual({ ok: true, cost: 0 });
  });

  it('keeps the same closed decision ids', () => {
    const tower = createTower(1);
    tower.closedDecisions = Array.from({ length: CLOSED_DECISIONS_KEPT }, (_, i) => `e${i + 1}`);
    tower.treasureLevels = [-2, -5];
    const restored = deserializeState(serializeState(tower));
    expect(restored.closedDecisions).toEqual(tower.closedDecisions);
    expect(restored.treasureLevels).toEqual([-2, -5]);
  });

  it('keeps a restored decision expiring on time', () => {
    const tower = createTower(1);
    openFire(context(tower), 5);
    const restored = deserializeState(serializeState(tower));
    const deadline = restored.activeEvents[0]?.decision.deadlineStep ?? 0;
    restored.step = deadline;
    expect(answerDecision(restored, 'e1', 'helicopter')).toEqual({
      ok: false,
      error: 'EVENT_EXPIRED',
    });
  });
});
