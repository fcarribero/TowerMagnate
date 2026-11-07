import { describe, expect, it } from 'vitest';
import { groundOrigin } from './layout';

describe('groundOrigin', () => {
  it('leaves room for two basement floors at the given zoom', () => {
    expect(groundOrigin(800, 600, 1)).toEqual({ x: 100, y: 536 });
    expect(groundOrigin(800, 600, 2)).toEqual({ x: 100, y: 472 });
  });

  it('returns whole pixels for odd canvas sizes', () => {
    const origin = groundOrigin(1001, 751, 3);
    expect(Number.isInteger(origin.x)).toBe(true);
    expect(Number.isInteger(origin.y)).toBe(true);
  });

  it('never places the ground above the canvas', () => {
    expect(groundOrigin(100, 50, 4).y).toBe(0);
  });
});
