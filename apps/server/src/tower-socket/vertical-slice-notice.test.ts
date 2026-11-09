import { createVerticalSliceEngine, verticalSliceTower } from '@tower-magnate/engine/testing';
import { ServerMessageSchema, type ClientEvent, type TowerState } from '@tower-magnate/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConnectionRegistry } from '../gateway';
import { TowerRunner, type AdvanceTower, type TowerStore } from '../runner';
import { FakeSocket } from '../testing/fake-socket';
import { DELTA_INTERVAL_MS, DeltaBroadcaster } from './delta-broadcaster';
import { buildSnapshot } from './snapshot';
import { Viewports } from './viewports';

const TOWER = 'slice';
const VIEW = { levelFrom: 1, levelTo: 10, xFrom: 100, xTo: 209 };
const THREAT_STEP = 115_560;
const DEADLINE_STEP = 115_920;

class OneTowerStore implements TowerStore {
  constructor(private readonly state: TowerState) {}

  async load(): Promise<TowerState | null> {
    return this.state;
  }

  async save(): Promise<void> {}
}

interface SentMessage {
  t: string;
  p: { events?: ClientEvent[] };
}

describe('vertical slice forced bomb threat over the tower socket', () => {
  let clock: number;
  let runner: TowerRunner;
  let registry: ConnectionRegistry;
  let broadcaster: DeltaBroadcaster;
  let socket: FakeSocket;

  function sentEvents(): ClientEvent[] {
    return (socket.sent as SentMessage[])
      .filter((message) => message.t === 'events')
      .flatMap((message) => message.p.events ?? []);
  }

  function passUntil(done: () => boolean): void {
    for (let tick = 0; tick < 100 && !done(); tick += 1) {
      clock += DELTA_INTERVAL_MS;
      runner.tick();
      broadcaster.tick(registry);
    }
  }

  beforeEach(async () => {
    clock = 1_000_000;
    const engine = createVerticalSliceEngine();
    const advance: AdvanceTower = (state, steps) => {
      const { state: advanced, events } = engine.step(state, [], steps);
      return { state: advanced, events };
    };
    const sundayBeforeNine: TowerState = {
      ...verticalSliceTower(),
      step: THREAT_STEP - 2,
      stars: 2,
    };
    runner = new TowerRunner({
      store: new OneTowerStore(sundayBeforeNine),
      now: () => clock,
      advance,
    });
    registry = new ConnectionRegistry();
    const viewports = new Viewports();
    broadcaster = new DeltaBroadcaster({ runner, viewports, now: () => clock });
    socket = new FakeSocket();
    registry.add(socket, { userId: 'u1', towerId: TOWER });
    await runner.resume(TOWER);
    viewports.update(socket, VIEW);
    broadcaster.sendSnapshot(socket, buildSnapshot(runner.stateOf(TOWER) as TowerState, VIEW));
  });

  it('sends the bomb decision and its alert notice at 09:00 of day 13', () => {
    passUntil(() => sentEvents().length > 0);

    expect(sentEvents()).toEqual([
      expect.objectContaining({
        type: 'decisionOpened',
        step: THREAT_STEP,
        kind: 'bomb',
        deadlineStep: DEADLINE_STEP,
        options: ['pay', 'refuse'],
      }),
      expect.objectContaining({ type: 'news', step: THREAT_STEP, key: 'news.bombThreat' }),
    ]);
    for (const message of socket.sent) {
      expect(ServerMessageSchema.safeParse(message).success).toBe(true);
    }
  });
});
