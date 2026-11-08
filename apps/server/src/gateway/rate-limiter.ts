export const MAX_MESSAGES_PER_SECOND = 30;
const DEFAULT_WINDOW_MS = 1000;

/** Sliding window. Rejected attempts do not count against the limit. */
export class MessageRateLimiter {
  private readonly acceptedAt: number[] = [];

  constructor(
    private readonly limit: number = MAX_MESSAGES_PER_SECOND,
    private readonly windowMs: number = DEFAULT_WINDOW_MS,
  ) {}

  tryAccept(now: number): boolean {
    this.dropExpired(now);
    if (this.acceptedAt.length >= this.limit) {
      return false;
    }
    this.acceptedAt.push(now);
    return true;
  }

  isIdle(now: number): boolean {
    this.dropExpired(now);
    return this.acceptedAt.length === 0;
  }

  private dropExpired(now: number): void {
    while (this.acceptedAt.length > 0 && now - (this.acceptedAt[0] ?? now) >= this.windowMs) {
      this.acceptedAt.shift();
    }
  }
}
