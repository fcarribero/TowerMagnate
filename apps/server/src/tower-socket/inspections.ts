import { serverMessage, type InspectTarget } from '@tower-magnate/shared';
import { sendMessage, type ConnectionRegistry, type GatewaySocket } from '../gateway';
import type { TowerRunner } from '../runner';
import { inspectShaft, inspectUnit } from './inspect';

export const INSPECT_INTERVAL_MS = 1000;
const CHECK_INTERVAL_MS = 250;

interface Target {
  towerId: string;
  kind: 'unit' | 'shaft';
  id: string;
  sentAt: number;
}

export interface InspectionsOptions {
  runner: TowerRunner;
  now?: () => number;
}

/**
 * The unit or shaft each socket has open in its inspection window. A socket has at most one
 * target; it is answered right away, again once per second, and again after a change to a unit.
 */
export class Inspections {
  private readonly targets = new WeakMap<GatewaySocket, Target>();
  private readonly now: () => number;

  constructor(private readonly options: InspectionsOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Replaces the socket's target, or clears it with null, and answers a new target at once. */
  set(socket: GatewaySocket, towerId: string, target: InspectTarget | null): boolean {
    this.targets.delete(socket);
    if (target === null) {
      return true;
    }
    if (target.kind !== 'unit' && target.kind !== 'shaft') {
      return false;
    }
    this.targets.set(socket, { towerId, kind: target.kind, id: target.id, sentAt: 0 });
    this.send(socket);
    return true;
  }

  clear(socket: GatewaySocket): void {
    this.targets.delete(socket);
  }

  /** Answers again right away when the socket has this unit open. */
  pushChange(socket: GatewaySocket, unitId: string): void {
    const target = this.targets.get(socket);
    if (target?.kind === 'unit' && target.id === unitId) {
      this.send(socket);
    }
  }

  /** Answers every socket whose target was last answered a second ago or more. */
  tick(registry: ConnectionRegistry): void {
    const now = this.now();
    for (const socket of registry.allSockets()) {
      const target = this.targets.get(socket);
      if (target && now - target.sentAt >= INSPECT_INTERVAL_MS) {
        this.send(socket);
      }
    }
  }

  /** Ticks on a timer until the returned function is called. */
  start(registry: ConnectionRegistry, intervalMs = CHECK_INTERVAL_MS): () => void {
    const timer = setInterval(() => this.tick(registry), intervalMs);
    return () => clearInterval(timer);
  }

  private send(socket: GatewaySocket): void {
    const target = this.targets.get(socket);
    const state = target && this.options.runner.stateOf(target.towerId);
    if (!target || !state) {
      return;
    }
    const data =
      target.kind === 'shaft' ? inspectShaft(state, target.id) : inspectUnit(state, target.id);
    sendMessage(socket, serverMessage('inspect', data));
    if ('status' in data && data.status === 'gone') {
      this.targets.delete(socket);
    } else {
      target.sentAt = this.now();
    }
  }
}
