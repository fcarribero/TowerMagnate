import { describe, expect, it } from 'vitest';
import { MAX_DEPTH_X, depthOffset } from './unitDepth';

describe('depthOffset', () => {
  it('is zero when the camera looks straight at the room', () => {
    expect(depthOffset(100, 100, 100, MAX_DEPTH_X)).toBe(0);
  });

  it('moves toward the camera side and stops at the maximum', () => {
    expect(depthOffset(100, 150, 100, MAX_DEPTH_X)).toBe(Math.round(MAX_DEPTH_X / 2));
    expect(depthOffset(100, 900, 100, MAX_DEPTH_X)).toBe(MAX_DEPTH_X);
    expect(depthOffset(100, -900, 100, MAX_DEPTH_X)).toBe(-MAX_DEPTH_X);
  });

  it('is zero for an empty view', () => {
    expect(depthOffset(100, 500, 0, MAX_DEPTH_X)).toBe(0);
  });
});
