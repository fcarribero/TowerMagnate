import { isLayoutCommand, isLayoutEvent, step } from '@tower-magnate/engine';
import {
  MONEY_CAP,
  type CommandResult,
  type EngineEvent,
  type QueuedCommand,
  type TowerState,
} from '@tower-magnate/shared';
import type { TowerId } from '../snapshots';
import { stepsForElapsed } from './real-time';
import type { TowerStore } from './tower-store';

export const TICK_INTERVAL_MS = 100;

/** Running towers are saved this often, on top of the saves after commands and on pause. */
export const SNAPSHOT_INTERVAL_MS = 30_000;

export interface TowerAdvance {
  state: TowerState;
  events: EngineEvent[];
}

export type AdvanceTower = (state: TowerState, steps: number) => TowerAdvance;

/** A change made to a running tower outside the engine's commands. It gets the engine's own advance. */
export type TowerChange = (state: TowerState, advance: AdvanceTower) => TowerAdvance;

export interface TowerRunnerOptions {
  store: TowerStore;
  now?: () => number;
  advance?: AdvanceTower;
  onTickError?: (towerId: TowerId, error: unknown) => void;
  onSaveError?: (towerId: TowerId, error: unknown) => void;
}

interface PendingCommand {
  queued: QueuedCommand;
  resolve: (result: CommandResult) => void;
}

interface RunningTower {
  state: TowerState;
  startedAt: number;
  startStep: number;
  pending: PendingCommand[];
  /** Events of steps that have not been handed to the broadcaster yet. */
  events: EngineEvent[];
  /** Changes whenever the layout or the transport may have changed. Unique across towers and loads. */
  layoutVersion: number;
  /** Developer setting: how many times faster than real time the tower runs. */
  speed: number;
  /** Developer setting: while on, holds the money the tower really has; the state shows the cap. */
  realMoney: number | null;
}

export class UnknownTowerError extends Error {
  constructor(towerId: TowerId) {
    super(`Tower ${towerId} does not exist`);
    this.name = 'UnknownTowerError';
  }
}

const advanceWithEngine: AdvanceTower = (state, steps) => {
  const { state: advanced, events } = step(state, [], steps);
  return { state: advanced, events };
};

/**
 * Keeps the towers whose owners are connected in memory and moves them forward with the real
 * clock. A paused tower does not make up for the time it spent paused.
 */
export class TowerRunner {
  private readonly running = new Map<TowerId, RunningTower>();
  private readonly queues = new Map<TowerId, Promise<void>>();
  private readonly store: TowerStore;
  private readonly now: () => number;
  private readonly advance: AdvanceTower;
  private readonly onTickError: (towerId: TowerId, error: unknown) => void;
  private readonly onSaveError: (towerId: TowerId, error: unknown) => void;
  private stopped = false;
  private lastLayoutVersion = 0;

  constructor(options: TowerRunnerOptions) {
    this.store = options.store;
    this.now = options.now ?? Date.now;
    this.advance = options.advance ?? advanceWithEngine;
    this.onTickError = options.onTickError ?? (() => {});
    this.onSaveError = options.onSaveError ?? (() => {});
  }

  /** Loads the tower and starts its clock. Does nothing when it is already running or after shutdown. */
  resume(towerId: TowerId): Promise<void> {
    return this.inOrder(towerId, () => this.load(towerId));
  }

  /** Brings a running tower up to the current time and saves it without stopping it. */
  save(towerId: TowerId): Promise<void> {
    return this.inOrder(towerId, () => this.saveRunning(towerId));
  }

  /** Saves every running tower. A failed save is reported and does not stop the others. */
  async saveAll(): Promise<void> {
    await Promise.all(
      this.runningTowers().map((towerId) =>
        this.save(towerId).catch((error: unknown) => this.onSaveError(towerId, error)),
      ),
    );
  }

  /** Saves and pauses every running tower and refuses to resume any more. */
  async shutdown(): Promise<void> {
    this.stopped = true;
    await Promise.all(
      [...new Set([...this.queues.keys(), ...this.runningTowers()])].map((towerId) =>
        this.pause(towerId).catch((error: unknown) => this.onSaveError(towerId, error)),
      ),
    );
  }

  /** Brings the tower up to the current time, saves it and drops it from memory. */
  pause(towerId: TowerId): Promise<void> {
    return this.inOrder(towerId, () => this.saveAndForget(towerId));
  }

  isRunning(towerId: TowerId): boolean {
    return this.running.has(towerId);
  }

  runningTowers(): TowerId[] {
    return [...this.running.keys()];
  }

  stateOf(towerId: TowerId): TowerState | undefined {
    return this.running.get(towerId)?.state;
  }

  /**
   * A number that stays the same while the tower's floors, units and transport stay the same, so
   * anything derived from the layout can be kept until it changes.
   */
  layoutVersionOf(towerId: TowerId): number | undefined {
    return this.running.get(towerId)?.layoutVersion;
  }

  /**
   * Queues a command for a running tower. The result arrives on the next tick, once the engine
   * has applied it. Rejects when the tower is not running.
   */
  submit(towerId: TowerId, queued: QueuedCommand): Promise<CommandResult> {
    const tower = this.running.get(towerId);
    if (!tower) {
      return Promise.reject(new UnknownTowerError(towerId));
    }
    return new Promise((resolve) => tower.pending.push({ queued, resolve }));
  }

  /**
   * Applies a change that is not an engine command, such as a debug jump in time. The tower is
   * brought up to date first, and its real-time clock restarts from the changed step so the
   * runner does not try to make up for the jump. Rejects when the tower is not running.
   */
  change(towerId: TowerId, change: TowerChange): Promise<void> {
    return this.inOrder(towerId, async () => {
      const tower = this.running.get(towerId);
      if (!tower) {
        throw new UnknownTowerError(towerId);
      }
      this.applyPending(tower);
      this.catchUp(tower);
      const changed = change(tower.state, this.advance);
      tower.state = changed.state;
      tower.events.push(...changed.events);
      tower.layoutVersion = this.nextLayoutVersion();
      tower.startedAt = this.now();
      tower.startStep = tower.state.step;
      await this.store.save(towerId, this.savedState(tower));
    });
  }

  /** Developer setting: runs the tower `speed` times faster than real time, from now on. */
  setSpeed(towerId: TowerId, speed: number): Promise<void> {
    return this.inOrder(towerId, async () => {
      const tower = this.running.get(towerId);
      if (!tower) {
        throw new UnknownTowerError(towerId);
      }
      this.applyPending(tower);
      this.catchUp(tower);
      tower.speed = speed;
      tower.startedAt = this.now();
      tower.startStep = tower.state.step;
    });
  }

  /**
   * Developer setting: while on, the tower shows the cap as its money and spending does not take
   * any away. The money it really has is kept aside, saved, and shown again when turned off.
   */
  setInfiniteMoney(towerId: TowerId, enabled: boolean): Promise<void> {
    return this.inOrder(towerId, async () => {
      const tower = this.running.get(towerId);
      if (!tower) {
        throw new UnknownTowerError(towerId);
      }
      if (enabled && tower.realMoney === null) {
        tower.realMoney = tower.state.money;
      } else if (!enabled && tower.realMoney !== null) {
        tower.state = { ...tower.state, money: tower.realMoney };
        tower.realMoney = null;
      }
      this.topUpMoney(tower);
    });
  }

  private topUpMoney(tower: RunningTower): void {
    if (tower.realMoney !== null && tower.state.money !== MONEY_CAP) {
      tower.state = { ...tower.state, money: MONEY_CAP };
    }
  }

  /** The state to save: with infinite money on, it carries the money the tower really has. */
  private savedState(tower: RunningTower): TowerState {
    return tower.realMoney === null ? tower.state : { ...tower.state, money: tower.realMoney };
  }

  /** The events since the last call, oldest first. */
  takeEvents(towerId: TowerId): EngineEvent[] {
    const tower = this.running.get(towerId);
    return tower ? tower.events.splice(0) : [];
  }

  /**
   * Applies the queued commands, then advances every running tower to where the real clock
   * says it should be. A tick that accepted a command also saves the tower.
   */
  tick(): void {
    for (const [towerId, tower] of this.running) {
      try {
        const accepted = this.applyPending(tower);
        this.catchUp(tower);
        if (accepted) {
          this.save(towerId).catch((error: unknown) => this.onSaveError(towerId, error));
        }
      } catch (error) {
        this.onTickError(towerId, error);
      }
    }
  }

  /** Ticks on a timer until the returned function is called. */
  start(intervalMs = TICK_INTERVAL_MS): () => void {
    const timer = setInterval(() => this.tick(), intervalMs);
    return () => clearInterval(timer);
  }

  /** Saves every running tower on a timer until the returned function is called. */
  startAutosave(intervalMs = SNAPSHOT_INTERVAL_MS): () => void {
    const timer = setInterval(() => void this.saveAll(), intervalMs);
    return () => clearInterval(timer);
  }

  private async load(towerId: TowerId): Promise<void> {
    if (this.stopped || this.running.has(towerId)) {
      return;
    }
    const state = await this.store.load(towerId);
    if (state === null) {
      throw new UnknownTowerError(towerId);
    }
    this.running.set(towerId, {
      state,
      startedAt: this.now(),
      startStep: state.step,
      pending: [],
      events: [],
      layoutVersion: this.nextLayoutVersion(),
      speed: 1,
      realMoney: null,
    });
  }

  private async saveAndForget(towerId: TowerId): Promise<void> {
    const tower = this.running.get(towerId);
    if (!tower) {
      return;
    }
    this.applyPending(tower);
    this.catchUp(tower);
    this.running.delete(towerId);
    await this.store.save(towerId, this.savedState(tower));
  }

  private async saveRunning(towerId: TowerId): Promise<void> {
    const tower = this.running.get(towerId);
    if (!tower) {
      return;
    }
    this.catchUp(tower);
    await this.store.save(towerId, this.savedState(tower));
  }

  /** Runs the queued commands against the tower and answers each sender. Returns true when one was accepted. */
  private applyPending(tower: RunningTower): boolean {
    const pending = tower.pending.splice(0);
    if (pending.length === 0) {
      return false;
    }
    const { state, results, events } = step(
      tower.state,
      pending.map((entry) => entry.queued),
      0,
    );
    tower.state = state;
    this.topUpMoney(tower);
    tower.events.push(...events);
    const changedLayout = results.some(
      (result, index) => result.ok && isLayoutCommand(pending[index]?.queued.command.type ?? ''),
    );
    if (changedLayout || events.some(isLayoutEvent)) {
      tower.layoutVersion = this.nextLayoutVersion();
    }
    pending.forEach((entry, index) => entry.resolve(results[index] as CommandResult));
    return results.some((result) => result.ok);
  }

  private catchUp(tower: RunningTower): void {
    const targetStep =
      tower.startStep + stepsForElapsed((this.now() - tower.startedAt) * tower.speed);
    const due = targetStep - tower.state.step;
    if (due > 0) {
      const advanced = this.advance(tower.state, due);
      tower.state = advanced.state;
      this.topUpMoney(tower);
      tower.events.push(...advanced.events);
      if (advanced.events.some(isLayoutEvent)) {
        tower.layoutVersion = this.nextLayoutVersion();
      }
    }
  }

  private nextLayoutVersion(): number {
    this.lastLayoutVersion += 1;
    return this.lastLayoutVersion;
  }

  private inOrder(towerId: TowerId, operation: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(towerId) ?? Promise.resolve();
    const next = previous.then(operation);
    const settled = next.catch(() => {});
    this.queues.set(towerId, settled);
    void settled.then(() => {
      if (this.queues.get(towerId) === settled) {
        this.queues.delete(towerId);
      }
    });
    return next;
  }
}
