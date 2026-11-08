import { addPerson, createTower, setStructure } from '@tower-magnate/engine';
import {
  ServerMessageSchema,
  type Delta,
  type Snapshot,
  type TowerState,
} from '@tower-magnate/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConnectionRegistry } from '../gateway';
import { TowerRunner, type TowerStore } from '../runner';
import { FakeSocket } from '../testing/fake-socket';
import { DELTA_INTERVAL_MS, DeltaBroadcaster } from './delta-broadcaster';
import { buildSnapshot } from './snapshot';
import { Viewports } from './viewports';

const VIEW = { levelFrom: 1, levelTo: 3, xFrom: 0, xTo: 200 };
const TOWER = 'tower-1';

class OneTowerStore implements TowerStore {
  constructor(private readonly state: TowerState) {}

  async load(): Promise<TowerState | null> {
    return this.state;
  }

  async save(): Promise<void> {}
}

interface Message {
  t: string;
  p: Snapshot | Delta;
}

/** The part of the web client's merge that the server's fields feed. */
function applyDelta(snapshot: Snapshot, delta: Delta): Snapshot {
  return {
    ...snapshot,
    step: delta.step,
    money: delta.money ?? snapshot.money,
    population: delta.population ?? snapshot.population,
    cars: delta.cars,
    people: delta.people,
  };
}

describe('delta broadcaster', () => {
  let clock: number;
  let runner: TowerRunner;
  let registry: ConnectionRegistry;
  let viewports: Viewports;
  let broadcaster: DeltaBroadcaster;
  let socket: FakeSocket;
  let moneyPerStep: number;

  function towerState(): TowerState {
    const state = runner.stateOf(TOWER);
    if (!state) {
      throw new Error('Tower is not running');
    }
    return state;
  }

  function messages(type: string): Message[] {
    return (socket.sent as Message[]).filter((message) => message.t === type);
  }

  function pass(ms: number): void {
    const end = clock + ms;
    while (clock < end) {
      clock += DELTA_INTERVAL_MS;
      runner.tick();
      broadcaster.tick(registry);
    }
  }

  beforeEach(async () => {
    clock = 1_000_000;
    moneyPerStep = 0;
    const state = createTower(5);
    setStructure(state.grid, 1, 0, 9, 'lobby');
    addPerson(state, { kind: 'officeWorker', homeUnit: 0, level: 1, column: 3 });
    runner = new TowerRunner({
      store: new OneTowerStore(state),
      now: () => clock,
      advance: (current, steps) => ({
        ...current,
        step: current.step + steps,
        money: current.money + steps * moneyPerStep,
      }),
    });
    registry = new ConnectionRegistry();
    viewports = new Viewports();
    broadcaster = new DeltaBroadcaster({ runner, viewports, now: () => clock });
    socket = new FakeSocket();
    registry.add(socket, { userId: 'u1', towerId: TOWER });
    await runner.resume(TOWER);
    viewports.update(socket, VIEW);
    broadcaster.sendSnapshot(socket, buildSnapshot(towerState(), VIEW));
  });

  it('sends five deltas a second while something changes', () => {
    moneyPerStep = 10;

    pass(5000);

    expect(messages('delta')).toHaveLength(25);
    expect(messages('snapshot')).toHaveLength(1);
  });

  it('sends a step-only heartbeat once a second when idle', () => {
    pass(5000);

    const deltas = messages('delta');
    expect(deltas).toHaveLength(5);
    expect(Object.keys(deltas[0]?.p ?? {})).toEqual(['step', 'cars', 'people']);
  });

  it('keeps a client that applies every delta equal to a fresh snapshot after 10 minutes', () => {
    moneyPerStep = 7;
    let client = messages('snapshot')[0]?.p as Snapshot;
    let applied = 0;

    for (let second = 0; second < 600; second += 1) {
      pass(1000);
      for (const message of messages('delta').slice(applied)) {
        client = applyDelta(client, message.p as Delta);
      }
      applied = messages('delta').length;
    }

    const fresh = buildSnapshot(towerState(), VIEW);
    expect(client).toEqual(fresh);
  });

  it('sends only messages the shared schema accepts', () => {
    moneyPerStep = 1;

    pass(1000);

    for (const message of socket.sent) {
      expect(ServerMessageSchema.safeParse(message).success).toBe(true);
    }
  });

  it('sends nothing to a socket that has not received a snapshot yet', () => {
    const other = new FakeSocket();
    registry.add(other, { userId: 'u1', towerId: TOWER });
    moneyPerStep = 10;

    pass(1000);

    expect(other.sent).toEqual([]);
  });
});
