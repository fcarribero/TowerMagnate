import { createTower, setStructure } from '@tower-magnate/engine';
import { clientMessage, PROTOCOL_VERSION, type TowerState } from '@tower-magnate/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalSession } from './local-session';

interface Sent {
  t: string;
  p: Record<string, unknown>;
}

const HELLO = JSON.stringify(clientMessage('hello', { protocol: PROTOCOL_VERSION }));

function buildFloor(id: string): string {
  return JSON.stringify(
    clientMessage('command', { id, command: { type: 'buildFloor', level: 2, x0: 10, x1: 14 } }),
  );
}

function debugFrame(type: string, p: Record<string, unknown>): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, t: type, p: { id: 'd1', ...p } });
}

describe('local session', () => {
  let state: TowerState;
  let sent: Sent[];
  let onChange: ReturnType<typeof vi.fn<() => void>>;
  let session: LocalSession;

  function open(debug: boolean): void {
    session = new LocalSession({
      state,
      debug,
      send: (data) => sent.push(JSON.parse(data) as Sent),
      onChange,
      now: Date.now,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    state = createTower(1);
    setStructure(state.grid, 1, 10, 29, 'lobby');
    state.grid.mainLobbyHeight = 1;
    sent = [];
    onChange = vi.fn<() => void>();
    open(false);
  });

  afterEach(() => {
    session.stop();
    vi.useRealTimers();
  });

  it('hello answers a snapshot of the given state', async () => {
    const startStep = state.step;
    await session.start();
    await session.receive(HELLO);

    const snapshots = sent.filter((m) => m.t === 'snapshot');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.p.step).toBe(startStep);
  });

  it('a frame sent before start resolves waits for it', async () => {
    const started = session.start();
    await session.receive(HELLO);
    await started;
    expect(sent.filter((m) => m.t === 'snapshot')).toHaveLength(1);
  });

  it('the clock advances with real time', async () => {
    await session.start();
    await session.receive(HELLO);
    const first = Number(sent[0]?.p.step);
    sent.length = 0;

    await vi.advanceTimersByTimeAsync(10_000);

    const steps = sent
      .filter((m) => m.t === 'delta' || m.t === 'snapshot')
      .map((m) => Number(m.p.step));
    expect(steps.length).toBeGreaterThan(0);
    expect(Math.max(...steps)).toBeGreaterThan(first);
  });

  it('a build command answers its commandResult and calls onChange', async () => {
    await session.start();
    await session.receive(HELLO);
    const answered = session.receive(buildFloor('c1'));
    await vi.advanceTimersByTimeAsync(300);
    await answered;

    expect(sent.find((m) => m.t === 'commandResult')?.p).toMatchObject({ id: 'c1', ok: true });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('debug frames are refused when debug is false', async () => {
    await session.start();
    await session.receive(HELLO);
    await session.receive(debugFrame('debug.fastForward', { steps: 10 }));

    expect(sent.find((m) => m.t === 'error')?.p).toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('saved state carries the real money with infinite money on', async () => {
    open(true);
    const money = state.money;
    await session.start();
    await session.receive(HELLO);
    await session.receive(debugFrame('debug.setInfiniteMoney', { enabled: true }));

    expect((await session.savedState()).money).toBe(money);
  });

  it('stop sends nothing more', async () => {
    await session.start();
    await session.receive(HELLO);
    await vi.advanceTimersByTimeAsync(1_000);
    session.stop();
    expect(vi.getTimerCount()).toBe(0);
    const count = sent.length;

    await vi.advanceTimersByTimeAsync(5_000);

    expect(sent).toHaveLength(count);
  });

  it('savedState does not call onChange, even with a command pending', async () => {
    const startMoney = state.money;
    await session.start();
    await session.receive(HELLO);
    const answered = session.receive(buildFloor('c1'));
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).not.toHaveBeenCalled();

    const saved = await session.savedState();

    // The pending command was applied by savedState itself, and the store was not touched.
    expect(onChange).not.toHaveBeenCalled();
    expect(saved.money).toBe(startMoney - 2500);
    expect(sent.find((m) => m.t === 'commandResult')?.p).toMatchObject({ id: 'c1', ok: true });
    await answered;
  });

  it('savedState rejects and receive does nothing after a failed start', async () => {
    const broken = {
      get state(): TowerState {
        throw new Error('no state');
      },
      debug: false,
      send: (data: string) => sent.push(JSON.parse(data) as Sent),
      onChange,
    } as unknown as ConstructorParameters<typeof LocalSession>[0];
    session = new LocalSession(broken);

    await expect(session.start()).rejects.toThrow();
    await session.receive(HELLO);
    await expect(session.savedState()).rejects.toThrow(/never loaded/);
    expect(sent).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('savedState rejects when stop came before start', async () => {
    session.stop();
    await session.start();
    await expect(session.savedState()).rejects.toThrow(/never loaded/);
  });

  it('a second start does not stack timers', async () => {
    await session.start();
    const timers = vi.getTimerCount();
    await session.start();
    expect(vi.getTimerCount()).toBe(timers);
  });

  it('onChange is called after a debug change', async () => {
    open(true);
    await session.start();
    await session.receive(HELLO);
    await session.receive(debugFrame('debug.setMoney', { amount: 1234 }));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});
