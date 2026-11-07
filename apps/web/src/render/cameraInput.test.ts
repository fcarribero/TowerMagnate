import { describe, expect, it } from 'vitest';
import { zoomKeyDirection } from './cameraInput';

describe('zoomKeyDirection', () => {
  it('zooms in with + and out with -', () => {
    expect(zoomKeyDirection('+')).toBe(1);
    expect(zoomKeyDirection('=')).toBe(1);
    expect(zoomKeyDirection('-')).toBe(-1);
    expect(zoomKeyDirection('a')).toBeNull();
  });
});
