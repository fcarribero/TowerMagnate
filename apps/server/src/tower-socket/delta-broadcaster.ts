import { serverMessage, type Snapshot } from '@tower-magnate/shared';
import { sendMessage, type ConnectionRegistry, type GatewaySocket } from '../gateway';
import type { TowerRunner } from '../runner';
import { diffSnapshots, needsFreshSnapshot } from './delta';
import { buildSnapshot } from './snapshot';
import type { Viewports } from './viewports';

export const DELTA_INTERVAL_MS = 200;
export const HEARTBEAT_INTERVAL_MS = 1000;

export interface DeltaBroadcasterOptions {
  runner: TowerRunner;
  viewports: Viewports;
  now?: () => number;
}

interface SentState {
  snapshot: Snapshot;
  sentAt: number;
}

/**
 * Keeps each socket in step with its tower. The snapshot sent on `hello` is the baseline, and
 * every delta is the difference from what that socket was last sent.
 */
export class DeltaBroadcaster {
  private readonly sent = new WeakMap<GatewaySocket, SentState>();
  private readonly now: () => number;

  constructor(private readonly options: DeltaBroadcasterOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Records the snapshot a socket was just sent and sends it. */
  sendSnapshot(socket: GatewaySocket, snapshot: Snapshot): void {
    sendMessage(socket, serverMessage('snapshot', snapshot));
    this.sent.set(socket, { snapshot, sentAt: this.now() });
  }

  /** Sends one delta, heartbeat or replacement snapshot to every socket that has a baseline. */
  tick(registry: ConnectionRegistry): void {
    for (const towerId of this.options.runner.runningTowers()) {
      const state = this.options.runner.stateOf(towerId);
      if (!state) {
        continue;
      }
      for (const socket of registry.socketsForTower(towerId)) {
        const baseline = this.sent.get(socket);
        if (baseline) {
          this.update(socket, baseline, buildSnapshot(state, this.options.viewports.get(socket)));
        }
      }
    }
  }

  /** Ticks on a timer until the returned function is called. */
  start(registry: ConnectionRegistry, intervalMs = DELTA_INTERVAL_MS): () => void {
    const timer = setInterval(() => this.tick(registry), intervalMs);
    return () => clearInterval(timer);
  }

  private update(socket: GatewaySocket, baseline: SentState, snapshot: Snapshot): void {
    if (snapshot.step === baseline.snapshot.step) {
      return;
    }
    const now = this.now();
    if (needsFreshSnapshot(baseline.snapshot, snapshot)) {
      this.sendSnapshot(socket, snapshot);
      return;
    }
    const { delta, quiet } = diffSnapshots(baseline.snapshot, snapshot);
    if (quiet && now - baseline.sentAt < HEARTBEAT_INTERVAL_MS) {
      return;
    }
    if (JSON.stringify(delta).length > JSON.stringify(snapshot).length) {
      this.sendSnapshot(socket, snapshot);
      return;
    }
    sendMessage(socket, serverMessage('delta', delta));
    this.sent.set(socket, { snapshot, sentAt: now });
  }
}
