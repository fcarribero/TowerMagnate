import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from './index';

describe('shared protocol version', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
  });
});
