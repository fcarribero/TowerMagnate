import { addPerson, createTower, setStructure } from '@tower-magnate/engine';
import {
  ServerMessageSchema,
  packCar,
  packPerson,
  unpackCar,
  unpackPerson,
  type Delta,
  type EngineEvent,
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
const DELTA_BUDGET_BYTES = 50_000;

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
    cars: delta.cars.map(unpackCar),
    people: delta.people.map(unpackPerson),
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
  let newsFor: (step: number) => EngineEvent[];

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
    newsFor = () => [];
    const state = createTower(5);
    setStructure(state.grid, 1, 0, 9, 'lobby');
    addPerson(state, { kind: 'officeWorker', homeUnit: 0, level: 1, column: 3 });
    runner = new TowerRunner({
      store: new OneTowerStore(state),
      now: () => clock,
      advance: (current, steps) => ({
        state: {
          ...current,
          step: current.step + steps,
          money: current.money + steps * moneyPerStep,
        },
        events: newsFor(current.step + steps),
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

  it('sends events right after the delta that covers their step', () => {
    newsFor = (step) => [{ type: 'news', step, key: 'news.test', unitId: null }];

    pass(DELTA_INTERVAL_MS);

    const order = socket.sent.map((message) => (message as Message).t);
    expect(order).toEqual(['snapshot', 'delta', 'events']);
    const delta = messages('delta')[0]?.p as Delta;
    const events = (messages('events')[0]?.p as unknown as { events: { step: number }[] }).events;
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.step <= delta.step)).toBe(true);
  });

  it('does not hold an idle delta back when events came with it', () => {
    newsFor = (step) => [{ type: 'news', step, key: 'news.test', unitId: null }];

    pass(DELTA_INTERVAL_MS * 2);

    expect(messages('delta')).toHaveLength(2);
    expect(messages('events')).toHaveLength(2);
  });

  it('does not repeat events a socket already saw', () => {
    newsFor = (step) =>
      step === 30 ? [{ type: 'news', step, key: 'news.test', unitId: null }] : [];

    pass(5000);

    expect(messages('events')).toHaveLength(1);
  });

  it('skips events that are older than the socket snapshot', () => {
    const late = new FakeSocket();
    registry.add(late, { userId: 'u1', towerId: TOWER });
    newsFor = (step) => [{ type: 'news', step, key: 'news.test', unitId: null }];
    clock += DELTA_INTERVAL_MS;
    runner.tick();
    const snapshotStep = towerState().step;
    broadcaster.sendSnapshot(late, buildSnapshot(towerState(), VIEW));

    clock += DELTA_INTERVAL_MS;
    runner.tick();
    broadcaster.tick(registry);

    const sent = (late.sent as unknown as { t: string; p: { events?: { step: number }[] } }[])
      .filter((message) => message.t === 'events')
      .flatMap((message) => message.p.events ?? []);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((event) => event.step > snapshotStep)).toBe(true);
  });

  it('keeps a full-screen delta under 50 KB', () => {
    const delta: Delta = {
      step: 1,
      cars: Array.from({ length: 192 }, (_, index) =>
        packCar({
          shaftId: 's24',
          index: index % 8,
          position: 88.5,
          direction: 'up',
          doors: 'open',
          load: 8,
        }),
      ),
      people: Array.from({ length: 250 }, (_, index) =>
        packPerson({
          id: `p${10_000 + index}`,
          kind: 'officeWorker',
          x: 123.5,
          level: 99,
          facing: 'right',
          mode: 'ride',
          carRef: { shaftId: 's24', index: 7 },
          stress: 'veryStressed',
        }),
      ),
    };

    expect(JSON.stringify(delta).length).toBeLessThan(DELTA_BUDGET_BYTES);
    expect(ServerMessageSchema.safeParse({ v: 1, t: 'delta', p: delta }).success).toBe(true);
  });

  it('sends nothing to a socket that has not received a snapshot yet', () => {
    const other = new FakeSocket();
    registry.add(other, { userId: 'u1', towerId: TOWER });
    moneyPerStep = 10;

    pass(1000);

    expect(other.sent).toEqual([]);
  });
});
