import { type Fire, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { step, type StepContext } from '../step';
import { buildTower, plainTowerPlan } from '../testing';
import { answerDecision, openFire } from './decisions';
import { openRandomFire } from './fire';

const WEDNESDAY = 2;

function officeTower(): TowerState {
  const { state } = buildTower({
    ...plainTowerPlan(50, 100, 259),
    units: [{ type: 'office', level: 45, x: 150 }],
  });
  state.stars = 3;
  state.step = WEDNESDAY * STEPS_PER_DAY + 15 * STEPS_PER_HOUR;
  return state;
}

function fires(state: TowerState): Fire[] {
  return state.activeEvents.filter((event): event is Fire => event.kind === 'fire');
}

describe('fire always ends', () => {
  it('leaves no active fire after the helicopter answers a forced fire', () => {
    const state = officeTower();
    const context: StepContext = { state, events: [] };
    const fire = openRandomFire(context) as Fire;
    expect(fire.level).toBe(45);
    const after = step(state, [], 60).state;
    expect(answerDecision(after, fire.id, 'helicopter').ok).toBe(true);
    expect(fires(step(after, [], 1).state)).toEqual([]);
  });

  it('ends a fire that never lit a level once its time is up', () => {
    const state = officeTower();
    openFire({ state, events: [] }, 45);
    expect(fires(state)[0]?.levels).toEqual({});
    expect(fires(step(state, [], STEPS_PER_DAY).state)).toEqual([]);
  });

  it('ends a fire left to burn by the next day', () => {
    const state = officeTower();
    openRandomFire({ state, events: [] });
    expect(fires(step(state, [], STEPS_PER_DAY).state)).toEqual([]);
  });
});
