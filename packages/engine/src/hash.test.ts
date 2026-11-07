import { describe, expect, it } from 'vitest';
import { hashState } from './hash';

describe('hashState', () => {
  it('ignores key order', () => {
    expect(hashState({ a: 1, b: { c: [1, 2], d: 'x' } })).toBe(
      hashState({ b: { d: 'x', c: [1, 2] }, a: 1 }),
    );
  });

  it('changes when any value changes', () => {
    expect(hashState({ a: 1, b: [1, 2] })).not.toBe(hashState({ a: 1, b: [2, 1] }));
    expect(hashState({ step: 1 })).not.toBe(hashState({ step: 2 }));
  });

  it('returns 8 hex digits', () => {
    expect(hashState({ step: 0 })).toMatch(/^[0-9a-f]{8}$/);
  });
});
