import { describe, expect, it } from 'vitest';
import { enlarge, outlineOf, STAR_FILLED, STAR_OUTLINE } from './pixelIcons';
import { statusFits } from './statusLayout';

const widths = { fixed: 700, windows: 110 };

describe('statusFits', () => {
  it('keeps the window buttons on the bar when everything fits', () => {
    expect(statusFits(810, widths)).toBe(true);
    expect(statusFits(2000, widths)).toBe(true);
  });

  it('moves the window buttons into the menu when it does not', () => {
    expect(statusFits(809, widths)).toBe(false);
    expect(statusFits(100, widths)).toBe(false);
  });
});

describe('star outline', () => {
  it('keeps the edge of the enlarged star and empties its middle', () => {
    expect(STAR_OUTLINE).toEqual(outlineOf(enlarge(STAR_FILLED, 2)));
    expect(STAR_OUTLINE).toHaveLength(14);
    expect(STAR_OUTLINE[5]).toBe('##..........##');
  });
});
