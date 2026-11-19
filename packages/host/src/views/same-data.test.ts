import { describe, expect, it } from 'vitest';
import { sameData } from './same-data';

describe('sameData', () => {
  it('compares primitives and null', () => {
    expect(sameData(1, 1)).toBe(true);
    expect(sameData('a', 'b')).toBe(false);
    expect(sameData(null, null)).toBe(true);
    expect(sameData(null, {})).toBe(false);
    expect(sameData(0, '0')).toBe(false);
  });

  it('compares nested objects and arrays by value', () => {
    const a = { id: 'p1', at: { level: 3, column: 120 }, tags: ['walk', 'left'] };
    expect(sameData(a, { id: 'p1', at: { level: 3, column: 120 }, tags: ['walk', 'left'] })).toBe(
      true,
    );
    expect(sameData(a, { id: 'p1', at: { level: 4, column: 120 }, tags: ['walk', 'left'] })).toBe(
      false,
    );
    expect(sameData(a, { id: 'p1', at: { level: 3, column: 120 }, tags: ['walk'] })).toBe(false);
  });

  it('ignores key order', () => {
    expect(sameData({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('treats undefined properties as missing, like JSON', () => {
    expect(sameData({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameData({ a: 1, b: null }, { a: 1 })).toBe(false);
  });

  it('tells arrays from objects', () => {
    expect(sameData([], {})).toBe(false);
    expect(sameData({ 0: 'x' }, ['x'])).toBe(false);
  });

  it('compares a missing item with undefined', () => {
    expect(sameData(undefined, { id: 'u1' })).toBe(false);
  });
});
