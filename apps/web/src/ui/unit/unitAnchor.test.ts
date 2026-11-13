import { describe, expect, it } from 'vitest';
import { anchoredPosition } from './unitAnchor';

const view = { width: 800, height: 600 };
const panel = { width: 200, height: 300 };

describe('anchoredPosition', () => {
  it('sits at the top right corner of the unit', () => {
    const unit = { x: 100, y: 120, width: 60, height: 40 };
    expect(anchoredPosition(unit, panel, view, 8)).toEqual({ x: 168, y: 120 });
  });

  it('moves to the left of the unit when the right side has no room', () => {
    const unit = { x: 700, y: 120, width: 60, height: 40 };
    expect(anchoredPosition(unit, panel, view, 8)).toEqual({ x: 492, y: 120 });
  });

  it('stays inside the view at the bottom and when the unit is partly off screen', () => {
    const unit = { x: -30, y: 500, width: 60, height: 40 };
    expect(anchoredPosition(unit, panel, view, 8)).toEqual({ x: 38, y: 300 });
    const offLeft = { x: 750, y: -20, width: 100, height: 40 };
    expect(anchoredPosition(offLeft, panel, view, 8)).toEqual({ x: 542, y: 0 });
  });
});
