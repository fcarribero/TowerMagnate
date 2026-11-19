import type { UploadOutcome } from './stateUploader';

export const AUTOSAVE_INTERVAL_MS = 30_000;
export const CHANGE_SAVE_DELAY_MS = 5_000;
export const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const; // the last one repeats
export const SAVE_FAILING_AFTER_MS = 120_000;

export interface SaveSchedulerOptions {
  save: () => Promise<UploadOutcome>;
  onFailingChange: (failing: boolean) => void;
  onStale: () => void;
  /** The server no longer accepts the session. The scheduler has stopped. */
  onUnauthenticated?: () => void;
  now?: () => number;
}

/**
 * One timer fires at the soonest of three due times: autosave, change
 * debounce and retry. So a pending changed() save never waits behind a
 * longer retry delay, and a retry never waits behind a later autosave.
 */
export class SaveScheduler {
  private readonly save: () => Promise<UploadOutcome>;
  private readonly onFailingChange: (failing: boolean) => void;
  private readonly onStale: () => void;
  private readonly onUnauthenticated: () => void;
  private readonly now: () => number;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private autosaveDue: number | null = null;
  private changeDue: number | null = null;
  private retryDue: number | null = null;
  private failingDue: number | null = null;
  private retryIndex = 0;
  private lastSuccess = 0;
  private failing = false;
  private inFlight = false;
  private pending = false;
  private started = false;
  private dead = false;
  /** Callers of flush() waiting for the next save to finish. */
  private flushWaiters: ((outcome: UploadOutcome) => void)[] = [];

  constructor(options: SaveSchedulerOptions) {
    this.save = options.save;
    this.onFailingChange = options.onFailingChange;
    this.onStale = options.onStale;
    this.onUnauthenticated = options.onUnauthenticated ?? (() => {});
    this.now = options.now ?? (() => Date.now());
  }

  start(): void {
    if (this.dead || this.started) return;
    this.started = true;
    this.lastSuccess = this.now();
    this.autosaveDue = this.now() + AUTOSAVE_INTERVAL_MS;
    this.rearm();
  }

  changed(): void {
    if (this.dead || !this.started) return;
    this.changeDue = this.now() + CHANGE_SAVE_DELAY_MS;
    this.rearm();
  }

  saveNow(): void {
    if (this.dead || !this.started) return;
    if (this.inFlight) {
      this.pending = true;
      return;
    }
    void this.run();
  }

  /** Saves now, or right after the save in flight, and resolves with that save's outcome. */
  flush(): Promise<UploadOutcome> {
    if (this.dead || !this.started) return Promise.resolve('failed');
    return new Promise((resolve) => {
      this.flushWaiters.push(resolve);
      this.saveNow();
    });
  }

  stop(): void {
    this.dead = true;
    this.answerFlush('failed', this.flushWaiters.splice(0));
    this.clearTimer();
    this.autosaveDue = this.changeDue = this.retryDue = this.failingDue = null;
    this.pending = false;
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private rearm(): void {
    this.clearTimer();
    if (this.dead || this.inFlight) return;
    const dues = [this.autosaveDue, this.changeDue, this.retryDue, this.failingDue].filter((d): d is number => d !== null);
    if (dues.length === 0) return;
    const delay = Math.max(0, Math.min(...dues) - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fire();
    }, delay);
  }

  private fire(): void {
    const t = this.now();
    if (this.failingDue !== null && t >= this.failingDue) {
      this.failingDue = null;
      if (!this.failing) {
        this.failing = true;
        this.notify(() => this.onFailingChange(true));
      }
    }
    const saveDue = [this.autosaveDue, this.changeDue, this.retryDue].some((d) => d !== null && t >= d);
    if (saveDue) void this.run();
    else this.rearm();
  }

  private answerFlush(outcome: UploadOutcome, waiters: ((outcome: UploadOutcome) => void)[]): void {
    for (const resolve of waiters) resolve(outcome);
  }

  // A throwing callback must not stop the scheduler.
  private notify(fn: () => void): void {
    try {
      fn();
    } catch {
      // ignored
    }
  }

  private async run(): Promise<void> {
    if (this.dead || this.inFlight) return;
    this.inFlight = true;
    const waiters = this.flushWaiters.splice(0);
    this.clearTimer();
    this.autosaveDue = this.changeDue = this.retryDue = this.failingDue = null;
    let outcome: UploadOutcome;
    try {
      outcome = await this.save();
    } catch {
      outcome = 'failed';
    }
    this.inFlight = false;
    this.answerFlush(outcome, waiters);
    if (this.dead) return;

    if (outcome === 'stale') {
      this.stop();
      this.notify(() => this.onStale());
      return;
    }
    if (outcome === 'unauthenticated') {
      this.stop();
      this.notify(() => this.onUnauthenticated());
      return;
    }
    if (outcome === 'saved') {
      this.retryIndex = 0;
      this.lastSuccess = this.now();
      this.autosaveDue = this.now() + AUTOSAVE_INTERVAL_MS;
      if (this.failing) {
        this.failing = false;
        this.notify(() => this.onFailingChange(false));
      }
    } else {
      const delay = RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)] ?? 60_000;
      this.retryIndex += 1;
      this.retryDue = this.now() + delay;
      if (!this.failing) {
        if (this.now() - this.lastSuccess >= SAVE_FAILING_AFTER_MS) {
          this.failing = true;
          this.notify(() => this.onFailingChange(true));
        } else {
          this.failingDue = this.lastSuccess + SAVE_FAILING_AFTER_MS;
        }
      }
    }
    if (this.pending) {
      this.pending = false;
      void this.run();
      return;
    }
    this.rearm();
  }
}
