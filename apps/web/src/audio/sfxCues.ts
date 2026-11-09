import type { SfxHandle, SfxPlayer } from './sfxPlayer';

export type SfxCuePlayer = Pick<
  SfxPlayer,
  'effectForTrigger' | 'canPlay' | 'playSfx' | 'onPlayable'
>;

/**
 * Plays manifest triggers with the rules of docs/design/sound.md: one-shots
 * respect `minIntervalMs`, loops play as one instance until stopped. A loop
 * asked for before its file can play (no gesture yet after a reload) starts
 * as soon as it can.
 */
export class SfxCues {
  private readonly lastStartedAt = new Map<string, number>();
  /** Loops that should be playing, with their handle once they started. */
  private readonly loops = new Map<string, SfxHandle | null>();

  constructor(
    private readonly player: SfxCuePlayer,
    private readonly now: () => number = () => performance.now(),
  ) {
    player.onPlayable(() => this.startWaitingLoops());
  }

  play(trigger: string): void {
    const effect = this.player.effectForTrigger(trigger);
    if (effect === undefined) {
      return;
    }
    const now = this.now();
    const lastStart = this.lastStartedAt.get(effect.id);
    if (lastStart !== undefined && now - lastStart < effect.minIntervalMs) {
      return;
    }
    this.lastStartedAt.set(effect.id, now);
    this.player.playSfx(effect.id);
  }

  /** Does nothing while the loop for `trigger` is already playing or waiting. */
  startLoop(trigger: string): void {
    if (this.loops.has(trigger)) {
      return;
    }
    this.loops.set(trigger, this.tryStart(trigger));
  }

  stopLoop(trigger: string): void {
    this.loops.get(trigger)?.stop();
    this.loops.delete(trigger);
  }

  isLooping(trigger: string): boolean {
    return this.loops.has(trigger);
  }

  private tryStart(trigger: string): SfxHandle | null {
    const effect = this.player.effectForTrigger(trigger);
    if (effect === undefined || !this.player.canPlay(effect.id)) {
      return null;
    }
    return this.player.playSfx(effect.id);
  }

  private startWaitingLoops(): void {
    for (const [trigger, handle] of this.loops) {
      if (handle === null) {
        this.loops.set(trigger, this.tryStart(trigger));
      }
    }
  }
}
