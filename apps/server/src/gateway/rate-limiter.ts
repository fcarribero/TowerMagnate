export const MAX_MESSAGES_PER_SECOND = 30;
const WINDOW_MS = 1000;

/** Sliding one-second window. Rejected messages do not count against the limit. */
export class MessageRateLimiter {
  private readonly acceptedAt: number[] = [];

  constructor(private readonly limit: number = MAX_MESSAGES_PER_SECOND) {}

  tryAccept(now: number): boolean {
    while (this.acceptedAt.length > 0 && now - (this.acceptedAt[0] ?? now) >= WINDOW_MS) {
      this.acceptedAt.shift();
    }
    if (this.acceptedAt.length >= this.limit) {
      return false;
    }
    this.acceptedAt.push(now);
    return true;
  }
}
