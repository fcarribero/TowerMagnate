import { LAST_COLUMN, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { towerCommandHandlers } from './commands';
import { addPerson, slotOfPerson } from './people';
import { createEngine, type SimulationSystem } from './step';
import { buildTower, plainTowerPlan } from './testing';
import { startTrek, trekPhaseAt, type TrekPlace } from './trek';
import { createTrekSystem } from './trek';

const LOBBY_RIGHT = 80;

interface Walker {
  state: TowerState;
  personId: number;
}

/** A lobby from column 0 to 80 on level 1 and a person standing at `column` on level 1. */
function walkerAt(column: number, lobby = { x0: 0, x1: LOBBY_RIGHT }): Walker {
  const { state } = buildTower(plainTowerPlan(1, lobby.x0, lobby.x1));
  const personId = addPerson(state, { kind: 'customer', homeUnit: 0, level: 1, column });
  return { state, personId };
}

/** An engine that starts one trek at its first step, then walks everyone. */
function engineStarting(
  personId: number,
  to: TrekPlace,
  streetColumn?: number,
): ReturnType<typeof createEngine> {
  const starter: SimulationSystem = (context) => {
    if (context.state.step !== 1) return;
    const slot = slotOfPerson(context.state.people, personId);
    expect(startTrek(context, slot, to, streetColumn)).toBe(true);
  };
  return createEngine({
    commandHandlers: towerCommandHandlers,
    systems: [starter, createTrekSystem()],
  });
}

function view(state: TowerState, personId: number) {
  const slot = slotOfPerson(state.people, personId);
  return {
    column: state.people.column[slot] as number,
    level: state.people.level[slot] as number,
    phase: trekPhaseAt(state.people, slot),
    dueStep: state.people.dueStep[slot] as number,
  };
}

describe('coming in from the street', () => {
  it('walks a person from the right map edge to the lobby end, then on to the destination', () => {
    const { state, personId } = walkerAt(LAST_COLUMN);
    const engine = engineStarting(personId, { level: 1, column: 20 });
    // The first step starts the trek and also takes the first step of the walk.
    let now = engine.step(state, [], 1).state;
    expect(view(now, personId)).toMatchObject({ phase: 'approaching', column: LAST_COLUMN - 1 });
    // One column per step along the ground, where no structure exists.
    now = engine.step(now, [], 10).state;
    expect(view(now, personId)).toMatchObject({
      phase: 'approaching',
      column: LAST_COLUMN - 11,
      level: 1,
    });
    now = engine.step(now, [], LAST_COLUMN - 11 - LOBBY_RIGHT - 1).state;
    expect(view(now, personId)).toMatchObject({ phase: 'approaching', column: LOBBY_RIGHT + 1 });
    // At the lobby end the planned trip starts.
    now = engine.step(now, [], 1).state;
    expect(view(now, personId)).toMatchObject({ phase: 'walkingToDestination', column: LOBBY_RIGHT });
    now = engine.step(now, [], LOBBY_RIGHT - 20).state;
    expect(view(now, personId)).toMatchObject({ phase: 'idle', column: 20 });
  });

  it('starts walking at once when the lobby reaches the map edge', () => {
    const { state, personId } = walkerAt(0);
    const engine = engineStarting(personId, { level: 1, column: 20 });
    const now = engine.step(state, [], 1).state;
    expect(view(now, personId).phase).toBe('walkingToDestination');
  });

  it('has no route, and no trek, when the tower has no lobby', () => {
    const { state, personId } = walkerAt(LAST_COLUMN);
    const slot = slotOfPerson(state.people, personId);
    for (const row of state.grid.levels[1]?.structure ?? []) row.kind = 'floor';
    const starter: SimulationSystem = (context) => {
      expect(startTrek(context, slot, { level: 1, column: 20 })).toBe(false);
    };
    createEngine({ commandHandlers: towerCommandHandlers, systems: [starter] }).step(state, [], 1);
  });
});

describe('leaving to the street', () => {
  it('walks on from the lobby end to the map edge before the trip is over', () => {
    const { state, personId } = walkerAt(60);
    const engine = engineStarting(personId, { level: 1, column: LOBBY_RIGHT }, LAST_COLUMN);
    let now = engine.step(state, [], 19).state;
    expect(view(now, personId)).toMatchObject({ phase: 'walkingToDestination', column: 79 });
    now = engine.step(now, [], 1).state;
    expect(view(now, personId)).toMatchObject({ phase: 'departing', column: LOBBY_RIGHT });
    now = engine.step(now, [], LAST_COLUMN - LOBBY_RIGHT - 1).state;
    expect(view(now, personId)).toMatchObject({ phase: 'departing', column: LAST_COLUMN - 1 });
    now = engine.step(now, [], 1).state;
    expect(view(now, personId)).toMatchObject({ phase: 'idle', column: LAST_COLUMN });
    // The trip finishes only at the edge, which is when the owner of the person hears of it.
    expect(view(now, personId).dueStep).toBe(now.step);
  });

  it('is finished at once at the lobby end when that is the map edge', () => {
    const { state, personId } = walkerAt(10);
    const engine = engineStarting(personId, { level: 1, column: 0 }, 0);
    const now = engine.step(state, [], 10).state;
    expect(view(now, personId)).toMatchObject({ phase: 'idle', column: 0 });
  });
});

describe('a demolished lobby puts people back on the street', () => {
  const demolishLobby = (x0: number, x1: number) => [
    {
      id: 'c1',
      command: { type: 'demolish', target: { kind: 'lobby', level: 1, x0, x1 } },
    },
  ];

  it('sends a walker on a demolished cell to the nearest edge, and in again to the same place', () => {
    const { state, personId } = walkerAt(30);
    const engine = engineStarting(personId, { level: 1, column: 70 });
    let now = engine.step(state, [], 3).state;
    expect(view(now, personId).column).toBe(33);
    // The left end of the lobby, with the person standing on it.
    const result = engine.step(now, demolishLobby(0, 40) as never, 1);
    expect(result.results[0]?.ok).toBe(true);
    now = result.state;
    // Out of sight at the left edge for a step, then walking in toward the new lobby end at 41.
    expect(view(now, personId).column).toBeLessThan(2);
    expect(view(now, personId).phase).toBe('approaching');
    now = engine.step(now, [], 41).state;
    expect(view(now, personId).column).toBeGreaterThanOrEqual(40);
    now = engine.step(now, [], 40).state;
    expect(view(now, personId)).toMatchObject({ phase: 'idle', column: 70 });
  });

  it('lets a person walking out finish the walk when the lobby goes', () => {
    const { state, personId } = walkerAt(60);
    const engine = engineStarting(personId, { level: 1, column: LOBBY_RIGHT }, LAST_COLUMN);
    let now = engine.step(state, [], LOBBY_RIGHT - 60).state;
    expect(view(now, personId).phase).toBe('departing');
    const result = engine.step(now, demolishLobby(50, LOBBY_RIGHT) as never, 1);
    expect(result.results[0]?.ok).toBe(true);
    now = result.state;
    expect(view(now, personId)).toMatchObject({ phase: 'idle', column: LAST_COLUMN });
  });
});
