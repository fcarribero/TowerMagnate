import { describe, expect, it } from 'vitest';
import { MAX_MESSAGES_PER_SECOND, MessageRateLimiter } from './rate-limiter';

function acceptMany(limiter: MessageRateLimiter, count: number, now: number): boolean[] {
  return Array.from({ length: count }, () => limiter.tryAccept(now));
}

describe('MessageRateLimiter', () => {
  it('accepts 30 messages in one second and rejects the 31st', () => {
    const limiter = new MessageRateLimiter();

    const results = acceptMany(limiter, MAX_MESSAGES_PER_SECOND + 1, 0);

    expect(results.filter(Boolean)).toHaveLength(30);
    expect(results.at(-1)).toBe(false);
  });

  it('accepts again once the oldest message is a second old', () => {
    const limiter = new MessageRateLimiter();
    limiter.tryAccept(0);
    acceptMany(limiter, 29, 500);

    expect(limiter.tryAccept(999)).toBe(false);
    expect(limiter.tryAccept(1000)).toBe(true);
    expect(limiter.tryAccept(1000)).toBe(false);
    expect(limiter.tryAccept(1500)).toBe(true);
  });

  it('does not count rejected messages', () => {
    const limiter = new MessageRateLimiter(2);
    acceptMany(limiter, 10, 0);

    expect(limiter.tryAccept(1000)).toBe(true);
    expect(limiter.tryAccept(1000)).toBe(true);
    expect(limiter.tryAccept(1000)).toBe(false);
  });
});
