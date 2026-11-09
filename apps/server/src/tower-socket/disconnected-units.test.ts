import { createTower, disconnectedUnits, setStructure } from '@tower-magnate/engine';
import type { EngineEvent, QueuedCommand, TowerState } from '@tower-magnate/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConnectionRegistry } from '../gateway';
import { TowerRunner, type TowerStore } from '../runner';
import { FakeSocket } from '../testing/fake-socket';
import { DELTA_INTERVAL_MS, DeltaBroadcaster } from './delta-broadcaster';
import { DisconnectedUnitsCache } from './disconnected-units';
import { Viewports } from './viewports';

const TOWER = 'tower-1';
const VIEW = { levelFrom: 1, levelTo: 3, xFrom: 0, xTo: 200 };
const FIRE: EngineEvent = { type: 'disaster', step: 0, kind: 'fire', cells: [] };

class OneTowerStore implements TowerStore {
  constructor(private readonly state: TowerState) {}

  async load(): Promise<TowerState | null> {
    return this.state;
  }

  async save(): Promise<void> {}
}

function command(id: string, x0: number, x1: number): QueuedCommand {
  return { id, command: { type: 'buildFloor', level: 2, x0, x1 } };
}

describe('disconnected units shared by the sockets of a tower', () => {
  let clock: number;
  let runner: TowerRunner;
  let registry: ConnectionRegistry;
  let broadcaster: DeltaBroadcaster;
  let sockets: FakeSocket[];
  let searches: number;
  let eventsOfNextAdvance: EngineEvent[];

  function pass(ms: number): void {
    const end = clock + ms;
    while (clock < end) {
      clock += DELTA_INTERVAL_MS;
      runner.tick();
      broadcaster.tick(registry);
    }
  }

  function updatesOf(socket: FakeSocket): string[] {
    return (socket.sent as { t: string }[]).map((message) => message.t);
  }

  beforeEach(async () => {
    clock = 1_000_000;
    searches = 0;
    eventsOfNextAdvance = [];
    const state = createTower(3);
    setStructure(state.grid, 1, 0, 29, 'lobby');
    state.grid.mainLobbyHeight = 1;
    runner = new TowerRunner({
      store: new OneTowerStore(state),
      now: () => clock,
      advance: (current, steps) => {
        const events = eventsOfNextAdvance;
        eventsOfNextAdvance = [];
        return { state: { ...current, step: current.step + steps }, events };
      },
    });
    const viewports = new Viewports();
    const cache = new DisconnectedUnitsCache(runner, (tower) => {
      searches += 1;
      return disconnectedUnits(tower);
    });
    broadcaster = new DeltaBroadcaster({
      runner,
      viewports,
      now: () => clock,
      disconnectedUnits: cache,
    });
    registry = new ConnectionRegistry();
    await runner.resume(TOWER);
    sockets = [new FakeSocket(), new FakeSocket(), new FakeSocket()];
    for (const [index, socket] of sockets.entries()) {
      registry.add(socket, { userId: `user-${index}`, towerId: TOWER });
      viewports.update(socket, VIEW);
      const state = runner.stateOf(TOWER) as TowerState;
      broadcaster.sendSnapshot(socket, broadcaster.snapshotFor(socket, TOWER, state));
    }
  });

  it('works them out once for every socket and does not repeat it on plain ticks', () => {
    pass(5000);

    expect(searches).toBe(1);
    for (const socket of sockets) {
      expect(updatesOf(socket).length).toBeGreaterThan(1);
    }
  });

  it('works them out again once after a command changes the layout', async () => {
    pass(1000);
    const answer = runner.submit(TOWER, command('c1', 10, 14));

    pass(5000);

    expect(await answer).toMatchObject({ ok: true });
    expect(searches).toBe(2);
  });

  it('keeps them after a command the engine rejects', async () => {
    pass(1000);
    const answer = runner.submit(TOWER, command('c1', 40, 30));

    pass(5000);

    expect(await answer).toMatchObject({ ok: false });
    expect(searches).toBe(1);
  });

  it('works them out again after a fire or a bomb changed the tower', () => {
    pass(1000);
    eventsOfNextAdvance = [FIRE];

    pass(5000);

    expect(searches).toBe(2);
  });

  it('works them out again when the tower is loaded again', async () => {
    pass(1000);
    await runner.pause(TOWER);
    await runner.resume(TOWER);

    pass(1000);

    expect(searches).toBe(2);
  });
});
