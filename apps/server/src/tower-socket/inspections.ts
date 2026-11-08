import { serverMessage, type InspectTarget } from '@tower-magnate/shared';
import { sendMessage, type ConnectionRegistry, type GatewaySocket } from '../gateway';
import type { TowerRunner } from '../runner';
import { inspectUnit } from './inspect';

export const INSPECT_INTERVAL_MS = 1000;
export const MAX_INSPECT_TARGETS = 5;
const CHECK_INTERVAL_MS = 250;

interface Target {
  towerId: string;
  unitId: string;
  sentAt: number;
}

export type AddResult = 'added' | 'limit' | 'unsupported';

export interface InspectionsOptions {
  runner: TowerRunner;
  now?: () => number;
}

/**
 * The units each socket has open in inspection windows, up to MAX_INSPECT_TARGETS. Each target
 * is answered right away, again once per second, and again after a change to that unit.
 */
export class Inspections {
  private readonly targets = new WeakMap<GatewaySocket, Map<string, Target>>();
  private readonly now: () => number;

  constructor(private readonly options: InspectionsOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Replaces all of the socket's targets with this one, or clears them with null. */
  set(socket: GatewaySocket, towerId: string, target: InspectTarget | null): boolean {
    this.targets.delete(socket);
    if (target === null) {
      return true;
    }
    return this.add(socket, towerId, target) === 'added';
  }

  /** Adds a target and answers it at once. Adding a target the socket already has answers it again. */
  add(socket: GatewaySocket, towerId: string, target: InspectTarget): AddResult {
    if (target.kind !== 'unit') {
      return 'unsupported';
    }
    const open = this.targets.get(socket) ?? new Map<string, Target>();
    if (!open.has(target.id) && open.size >= MAX_INSPECT_TARGETS) {
      return 'limit';
    }
    const entry = { towerId, unitId: target.id, sentAt: 0 };
    open.set(target.id, entry);
    this.targets.set(socket, open);
    this.send(socket, entry);
    return 'added';
  }

  remove(socket: GatewaySocket, target: InspectTarget): void {
    if (target.kind === 'unit') {
      this.targets.get(socket)?.delete(target.id);
    }
  }

  clear(socket: GatewaySocket): void {
    this.targets.delete(socket);
  }

  /** Answers again right away when the socket has this unit open. */
  pushChange(socket: GatewaySocket, unitId: string): void {
    const target = this.targets.get(socket)?.get(unitId);
    if (target) {
      this.send(socket, target);
    }
  }

  /** Answers every target that was last answered a second ago or more. */
  tick(registry: ConnectionRegistry): void {
    const now = this.now();
    for (const socket of registry.allSockets()) {
      for (const target of [...(this.targets.get(socket)?.values() ?? [])]) {
        if (now - target.sentAt >= INSPECT_INTERVAL_MS) {
          this.send(socket, target);
        }
      }
    }
  }

  /** Ticks on a timer until the returned function is called. */
  start(registry: ConnectionRegistry, intervalMs = CHECK_INTERVAL_MS): () => void {
    const timer = setInterval(() => this.tick(registry), intervalMs);
    return () => clearInterval(timer);
  }

  private send(socket: GatewaySocket, target: Target): void {
    const state = this.options.runner.stateOf(target.towerId);
    if (!state) {
      return;
    }
    const data = inspectUnit(state, target.unitId);
    sendMessage(socket, serverMessage('inspect', data));
    if (data.kind === 'unit' && data.status === 'gone') {
      this.targets.get(socket)?.delete(target.unitId);
    } else {
      target.sentAt = this.now();
    }
  }
}
