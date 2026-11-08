import { addPerson, createTower, newUnit } from '@tower-magnate/engine';
import type { TowerState } from '@tower-magnate/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConnectionRegistry } from '../gateway';
import type { TowerRunner } from '../runner';
import { FakeSocket } from '../testing/fake-socket';
import { INSPECT_INTERVAL_MS, Inspections } from './inspections';

const identity = { userId: 'user', towerId: 'tower' };
const unitTarget = (id: string) => ({ kind: 'unit', id }) as const;

interface Harness {
  state: TowerState;
  registry: ConnectionRegistry;
  inspections: Inspections;
  socket: FakeSocket;
  clock: { now: number };
}

function harness(): Harness {
  const state = createTower(3);
  state.units.u1 = newUnit('u1', 'office', 4, 2);
  state.units.u2 = newUnit('u2', 'condo', 20, 2);
  addPerson(state, { kind: 'officeWorker', homeUnit: 1, level: 2, column: 4 });
  const runner = { stateOf: (towerId: string) => (towerId === 'tower' ? state : undefined) };
  const clock = { now: 10_000 };
  const inspections = new Inspections({
    runner: runner as unknown as TowerRunner,
    now: () => clock.now,
  });
  const registry = new ConnectionRegistry();
  const socket = new FakeSocket();
  registry.add(socket, identity);
  return { state, registry, inspections, socket, clock };
}

interface InspectMessage {
  t: string;
  p: { id: string; status: string; name?: string | null };
}

function inspectsOf(socket: FakeSocket): InspectMessage[] {
  return (socket.sent as InspectMessage[]).filter((message) => message.t === 'inspect');
}

describe('inspect targets', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it('answers a new target at once', () => {
    h.inspections.set(h.socket, 'tower', unitTarget('u1'));

    expect(inspectsOf(h.socket).map((message) => [message.p.id, message.p.status])).toEqual([
      ['u1', 'ok'],
    ]);
  });

  it('answers once per second and not before', () => {
    h.inspections.set(h.socket, 'tower', unitTarget('u1'));

    h.clock.now += INSPECT_INTERVAL_MS - 1;
    h.inspections.tick(h.registry);
    expect(inspectsOf(h.socket)).toHaveLength(1);

    h.clock.now += 1;
    h.inspections.tick(h.registry);
    h.inspections.tick(h.registry);
    expect(inspectsOf(h.socket)).toHaveLength(2);
  });

  it('replaces the previous target', () => {
    h.inspections.set(h.socket, 'tower', unitTarget('u1'));
    h.inspections.set(h.socket, 'tower', unitTarget('u2'));
    h.socket.sent.length = 0;

    h.clock.now += INSPECT_INTERVAL_MS;
    h.inspections.tick(h.registry);

    expect(inspectsOf(h.socket).map((message) => message.p.id)).toEqual(['u2']);
  });

  it('clears the target with null', () => {
    h.inspections.set(h.socket, 'tower', unitTarget('u1'));
    h.inspections.set(h.socket, 'tower', null);
    h.socket.sent.length = 0;

    h.clock.now += 5 * INSPECT_INTERVAL_MS;
    h.inspections.tick(h.registry);

    expect(h.socket.sent).toEqual([]);
  });

  it('clears the target when the client resyncs', () => {
    h.inspections.set(h.socket, 'tower', unitTarget('u1'));
    h.inspections.clear(h.socket);
    h.socket.sent.length = 0;

    h.clock.now += INSPECT_INTERVAL_MS;
    h.inspections.tick(h.registry);

    expect(h.socket.sent).toEqual([]);
  });

  it('stops answering a socket that closed', () => {
    h.inspections.set(h.socket, 'tower', unitTarget('u1'));
    h.socket.sent.length = 0;
    h.registry.remove(h.socket);

    h.clock.now += INSPECT_INTERVAL_MS;
    h.inspections.tick(h.registry);

    expect(h.socket.sent).toEqual([]);
  });

  it('answers gone once for an unknown unit and clears the target', () => {
    h.inspections.set(h.socket, 'tower', unitTarget('u99'));
    h.clock.now += 3 * INSPECT_INTERVAL_MS;
    h.inspections.tick(h.registry);

    expect(inspectsOf(h.socket).map((message) => message.p.status)).toEqual(['gone']);
  });

  it('answers gone once when the inspected unit is demolished', () => {
    h.inspections.set(h.socket, 'tower', unitTarget('u1'));
    delete h.state.units.u1;

    h.clock.now += INSPECT_INTERVAL_MS;
    h.inspections.tick(h.registry);
    h.clock.now += INSPECT_INTERVAL_MS;
    h.inspections.tick(h.registry);

    expect(inspectsOf(h.socket).map((message) => message.p.status)).toEqual(['ok', 'gone']);
  });

  it('pushes right away after a change to the inspected unit only', () => {
    h.inspections.set(h.socket, 'tower', unitTarget('u1'));
    h.state.units.u1 = { ...newUnit('u1', 'office', 4, 2), name: 'Nueva' };

    h.inspections.pushChange(h.socket, 'u2');
    expect(inspectsOf(h.socket)).toHaveLength(1);

    h.inspections.pushChange(h.socket, 'u1');
    expect(inspectsOf(h.socket)).toHaveLength(2);
    expect(inspectsOf(h.socket)[1]?.p.name).toBe('Nueva');
  });

  it('answers a second after a change push, not at the old schedule', () => {
    h.inspections.set(h.socket, 'tower', unitTarget('u1'));
    h.clock.now += 600;
    h.inspections.pushChange(h.socket, 'u1');
    h.clock.now += 600;
    h.inspections.tick(h.registry);
    expect(inspectsOf(h.socket)).toHaveLength(2);

    h.clock.now += 400;
    h.inspections.tick(h.registry);
    expect(inspectsOf(h.socket)).toHaveLength(3);
  });

  it('refuses targets that are not units and leaves the socket without a target', () => {
    h.inspections.set(h.socket, 'tower', unitTarget('u1'));

    expect(h.inspections.set(h.socket, 'tower', { kind: 'finances' })).toBe(false);
    h.socket.sent.length = 0;
    h.clock.now += INSPECT_INTERVAL_MS;
    h.inspections.tick(h.registry);

    expect(h.socket.sent).toEqual([]);
  });

  it('answers a shaft target and then gone once it is removed', () => {
    h.state.shafts.s1 = {
      id: 's1',
      type: 'standard',
      x: 30,
      bottom: 1,
      top: 3,
      stops: [1, 2, 3],
      schedule: { weekday: [], weekend: [] },
      cars: [],
      queues: {},
      paid: 0,
      placedAtStep: 0,
    };
    h.inspections.set(h.socket, 'tower', { kind: 'shaft', id: 's1' });
    delete h.state.shafts.s1;

    h.clock.now += INSPECT_INTERVAL_MS;
    h.inspections.tick(h.registry);
    h.clock.now += INSPECT_INTERVAL_MS;
    h.inspections.tick(h.registry);

    expect(inspectsOf(h.socket).map((message) => message.p.status)).toEqual(['ok', 'gone']);
  });
});
