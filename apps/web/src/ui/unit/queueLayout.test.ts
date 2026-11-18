import { describe, expect, it } from 'vitest';
import { queueLayout } from './queueLayout';

const rowsOf = (breaks: boolean[]): number => breaks.filter(Boolean).length + 1;

describe('queue layout', () => {
  it('keeps the normal gap when everyone fits side by side', () => {
    const layout = queueLayout([10, 10, 10], 100, 2);
    expect(layout.breakBefore).toEqual([false, false, false]);
    expect(layout.marginLeft).toEqual([0, 2, 2]);
  });

  it('overlaps people in one row before it starts a second one', () => {
    // 10 people 16 wide in 100: 178 side by side, so they overlap.
    const layout = queueLayout(new Array<number>(10).fill(16), 100, 2);
    expect(rowsOf(layout.breakBefore)).toBe(1);
    const step = layout.marginLeft[1] as number;
    expect(step).toBeLessThan(0);
    // The row fits the width.
    expect(16 * 10 + step * 9).toBeLessThanOrEqual(100);
    // Every person still shows at least 40% of the width.
    expect(16 + step).toBeGreaterThanOrEqual(0.4 * 16);
  });

  it('adds a row only when the overlap would hide too much, and splits people evenly', () => {
    // At 6.4 visible each, a row of 100 holds floor((100 - 16) / 6.4) + 1 = 14 people.
    const one = queueLayout(new Array<number>(14).fill(16), 100, 2);
    expect(rowsOf(one.breakBefore)).toBe(1);
    const two = queueLayout(new Array<number>(15).fill(16), 100, 2);
    expect(rowsOf(two.breakBefore)).toBe(2);
    expect(two.breakBefore.indexOf(true)).toBe(8);
    expect(two.marginLeft[8]).toBe(0);
  });

  it('puts one person per row when not even one fits', () => {
    const layout = queueLayout([30, 30], 20, 2);
    expect(layout.breakBefore).toEqual([false, true]);
    expect(layout.marginLeft).toEqual([0, 0]);
  });

  it('handles an empty queue', () => {
    expect(queueLayout([], 100, 2)).toEqual({ breakBefore: [], marginLeft: [] });
  });
});
