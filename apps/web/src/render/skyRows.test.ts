import { describe, expect, it } from 'vitest';
import { skyBandForLevel, skySpriteId } from './skyRows';

describe('skyBandForLevel', () => {
  it('is pale near the ground and deep at the top', () => {
    expect(skyBandForLevel(1)).toBe('horizon');
    expect(skyBandForLevel(5)).toBe('horizon');
    expect(skyBandForLevel(6)).toBe('middle');
    expect(skyBandForLevel(89)).toBe('middle');
    expect(skyBandForLevel(90)).toBe('top');
    expect(skyBandForLevel(104)).toBe('top');
  });

  it('names a day sky sprite', () => {
    expect(skySpriteId(50)).toBe('sky/day/middle');
    expect(skySpriteId(50, 'dusk')).toBe('sky/dusk/middle');
    expect(skySpriteId(1, 'night')).toBe('sky/night/horizon');
  });
});
