import {
  serverMessage,
  type ClientEvent,
  type HeatKind,
  type Snapshot,
  type TowerState,
} from '@tower-magnate/shared';
import { sendMessage, type HostSocket, type SocketSet } from '../port';
import type { TowerRunner } from '../runner/tower-runner';
import { toClientEvents } from '../views/client-events';
import { diffSnapshots, needsFreshSnapshot } from '../views/delta';
import { buildHeatData } from '../views/heat-view';
import { buildSnapshot } from '../views/snapshot';
import { DisconnectedUnitsCache } from './disconnected-units';
import type { Viewports } from './viewports';

export const DELTA_INTERVAL_MS = 200;
export const HEARTBEAT_INTERVAL_MS = 1000;
/** A heat map changes once a game minute, which is 6 steps. */
const HEAT_STEPS = 6;

export interface DeltaBroadcasterOptions {
  runner: TowerRunner;
  viewports: Viewports;
  now?: () => number;
  disconnectedUnits?: DisconnectedUnitsCache;
}

interface SentState {
  snapshot: Snapshot;
  sentAt: number;
  /** A snapshot sent between ticks already shows the events up to its step. */
  shownEventsUpTo: number | null;
}

/**
 * Keeps each socket in step with its tower. The snapshot sent on `hello` is the baseline, and
 * every delta is the difference from what that socket was last sent.
 */
export class DeltaBroadcaster {
  private readonly sent = new WeakMap<HostSocket, SentState>();
  private readonly heat = new WeakMap<HostSocket, { kind: HeatKind; sentStep: number | null }>();
  private readonly now: () => number;
  private readonly disconnectedUnits: DisconnectedUnitsCache;

  constructor(private readonly options: DeltaBroadcasterOptions) {
    this.now = options.now ?? Date.now;
    this.disconnectedUnits =
      options.disconnectedUnits ?? new DisconnectedUnitsCache(options.runner);
  }

  /** The snapshot of a tower as one socket sees it, through that socket's viewport. */
  snapshotFor(socket: HostSocket, towerId: string, state: TowerState): Snapshot {
    const disconnected = this.disconnectedUnits.of(towerId, state);
    return buildSnapshot(state, this.options.viewports.get(socket), disconnected);
  }

  /** Starts (or stops, with null) sending a heat map to a socket; the next tick sends the first one. */
  setHeat(socket: HostSocket, kind: HeatKind | null): void {
    if (kind === null) this.heat.delete(socket);
    else this.heat.set(socket, { kind, sentStep: null });
  }

  private sendHeat(socket: HostSocket, state: TowerState): void {
    const wanted = this.heat.get(socket);
    if (!wanted) return;
    if (wanted.sentStep !== null && state.step - wanted.sentStep < HEAT_STEPS) return;
    wanted.sentStep = state.step;
    sendMessage(socket, serverMessage('heat', buildHeatData(state, wanted.kind)));
  }

  /** Records the snapshot a socket was just sent and sends it. */
  sendSnapshot(socket: HostSocket, snapshot: Snapshot): void {
    this.recordSnapshot(socket, snapshot, snapshot.step);
  }

  private recordSnapshot(
    socket: HostSocket,
    snapshot: Snapshot,
    shownEventsUpTo: number | null,
  ): void {
    sendMessage(socket, serverMessage('snapshot', snapshot));
    this.sent.set(socket, { snapshot, sentAt: this.now(), shownEventsUpTo });
  }

  /** Sends one delta, heartbeat or replacement snapshot to every socket that has a baseline. */
  tick(sockets: SocketSet): void {
    const runningTowers = this.options.runner.runningTowers();
    this.disconnectedUnits.keepOnly(runningTowers);
    for (const towerId of runningTowers) {
      const state = this.options.runner.stateOf(towerId);
      if (!state) {
        continue;
      }
      const events = toClientEvents(this.options.runner.takeEvents(towerId));
      for (const socket of sockets.socketsForTower(towerId)) {
        const baseline = this.sent.get(socket);
        if (baseline) {
          const snapshot = this.snapshotFor(socket, towerId, state);
          this.update(socket, baseline, snapshot, events);
          this.sendHeat(socket, state);
        }
      }
    }
  }

  /** Ticks on a timer until the returned function is called. */
  start(sockets: SocketSet, intervalMs = DELTA_INTERVAL_MS): () => void {
    const timer = setInterval(() => this.tick(sockets), intervalMs);
    return () => clearInterval(timer);
  }

  private update(
    socket: HostSocket,
    baseline: SentState,
    snapshot: Snapshot,
    events: readonly ClientEvent[],
  ): void {
    const news = events.filter(
      (event) => baseline.shownEventsUpTo === null || event.step > baseline.shownEventsUpTo,
    );
    // The clock may be stopped: a command still changes the tower without a new step, and the
    // diff below decides whether there is anything to send.
    this.sendUpdate(socket, baseline, snapshot, news.length > 0);
    if (news.length > 0) {
      sendMessage(socket, serverMessage('events', { events: news }));
    }
  }

  /** The delta, or a snapshot when that is smaller. Idle updates wait for the heartbeat. */
  private sendUpdate(
    socket: HostSocket,
    baseline: SentState,
    snapshot: Snapshot,
    hasEvents: boolean,
  ): void {
    const now = this.now();
    if (needsFreshSnapshot(baseline.snapshot, snapshot)) {
      this.recordSnapshot(socket, snapshot, null);
      return;
    }
    const { delta, quiet } = diffSnapshots(baseline.snapshot, snapshot);
    if (quiet && !hasEvents && now - baseline.sentAt < HEARTBEAT_INTERVAL_MS) {
      return;
    }
    const deltaText = JSON.stringify(serverMessage('delta', delta));
    if (deltaText.length > JSON.stringify(serverMessage('snapshot', snapshot)).length) {
      this.recordSnapshot(socket, snapshot, null);
      return;
    }
    socket.send(deltaText);
    this.sent.set(socket, { snapshot, sentAt: now, shownEventsUpTo: null });
  }
}
