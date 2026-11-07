import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCameraInput, zoomKeyDirection } from './cameraInput';
import type { Camera } from './camera';

describe('zoomKeyDirection', () => {
  it('zooms in with + and out with -', () => {
    expect(zoomKeyDirection('+')).toBe(1);
    expect(zoomKeyDirection('=')).toBe(1);
    expect(zoomKeyDirection('-')).toBe(-1);
    expect(zoomKeyDirection('a')).toBeNull();
  });
});

describe('attachCameraInput zoom keys', () => {
  let detach: () => void = () => {};

  afterEach(() => {
    detach();
    document.body.innerHTML = '';
  });

  function setup() {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const update = vi.fn();
    detach = attachCameraInput(canvas, () => ({}) as Camera, update);
    return { canvas, update };
  }

  function press(target: EventTarget, init: KeyboardEventInit) {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  }

  it('zooms when + or - is pressed outside text fields', () => {
    const { update } = setup();
    press(document.body, { key: '+' });
    press(document.body, { key: '-' });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('ignores zoom keys typed in a text field', () => {
    const { update } = setup();
    const input = document.createElement('input');
    document.body.append(input);
    for (const key of ['+', '-', '=', '_']) {
      press(input, { key });
    }
    expect(update).not.toHaveBeenCalled();
  });

  it('ignores zoom keys held with Ctrl, Meta or Alt', () => {
    const { canvas, update } = setup();
    press(canvas, { key: '=', ctrlKey: true });
    press(canvas, { key: '-', metaKey: true });
    press(canvas, { key: '+', altKey: true });
    expect(update).not.toHaveBeenCalled();
  });
});
