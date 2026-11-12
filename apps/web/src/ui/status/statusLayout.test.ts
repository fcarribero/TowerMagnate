import { describe, expect, it } from 'vitest';
import { enlarge, outlineOf, STAR_FILLED, STAR_OUTLINE } from './pixelIcons';
import { statusCollapse } from './statusLayout';

const widths = { fixed: 700, zoom: 40, windows: 110 };

describe('statusCollapse', () => {
  it('keeps everything on the bar when it fits', () => {
    expect(statusCollapse(850, widths)).toBe('none');
    expect(statusCollapse(2000, widths)).toBe('none');
  });

  it('drops the window buttons first', () => {
    expect(statusCollapse(849, widths)).toBe('windows');
    expect(statusCollapse(740, widths)).toBe('windows');
  });

  it('then drops the zoom buttons', () => {
    expect(statusCollapse(739, widths)).toBe('windowsAndZoom');
    expect(statusCollapse(100, widths)).toBe('windowsAndZoom');
  });
});

describe('star outline', () => {
  it('keeps the edge of the enlarged star and empties its middle', () => {
    expect(STAR_OUTLINE).toEqual(outlineOf(enlarge(STAR_FILLED, 2)));
    expect(STAR_OUTLINE).toHaveLength(14);
    expect(STAR_OUTLINE[5]).toBe('##..........##');
  });
});
