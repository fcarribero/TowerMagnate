import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCameraInput, scrollKeyDirection, zoomKeyDirection } from './cameraInput';
import type { Camera } from './camera';

describe('zoomKeyDirection', () => {
  it('zooms in with + and out with -', () => {
    expect(zoomKeyDirection('+')).toBe(1);
    expect(zoomKeyDirection('=')).toBe(1);
    expect(zoomKeyDirection('-')).toBe(-1);
    expect(zoomKeyDirection('_')).toBe(-1);
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

  it('ignores zoom keys in textareas, selects and contenteditable elements', () => {
    const { update } = setup();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const fields = [document.createElement('textarea'), document.createElement('select'), editor];
    for (const field of fields) {
      document.body.append(field);
      for (const key of ['+', '-', '=', '_']) {
        press(field, { key });
      }
    }
    expect(update).not.toHaveBeenCalled();
  });

  it('still zooms from the canvas after typing in a text field', () => {
    const { canvas, update } = setup();
    const input = document.createElement('input');
    document.body.append(input);
    press(input, { key: '-' });
    press(canvas, { key: '+' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('ignores zoom keys held with Ctrl, Meta or Alt', () => {
    const { canvas, update } = setup();
    press(canvas, { key: '=', ctrlKey: true });
    press(canvas, { key: '-', metaKey: true });
    press(canvas, { key: '+', altKey: true });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('scrollKeyDirection', () => {
  it('moves the content opposite to the arrow', () => {
    expect(scrollKeyDirection('ArrowLeft')).toEqual({ x: 1, y: 0 });
    expect(scrollKeyDirection('ArrowRight')).toEqual({ x: -1, y: 0 });
    expect(scrollKeyDirection('ArrowUp')).toEqual({ x: 0, y: 1 });
    expect(scrollKeyDirection('ArrowDown')).toEqual({ x: 0, y: -1 });
  });

  it('maps W A S D like the arrows in either case', () => {
    expect(scrollKeyDirection('w')).toEqual(scrollKeyDirection('ArrowUp'));
    expect(scrollKeyDirection('A')).toEqual(scrollKeyDirection('ArrowLeft'));
    expect(scrollKeyDirection('s')).toEqual(scrollKeyDirection('ArrowDown'));
    expect(scrollKeyDirection('D')).toEqual(scrollKeyDirection('ArrowRight'));
    expect(scrollKeyDirection('x')).toBeNull();
  });
});

describe('attachCameraInput scroll keys and Space pan', () => {
  let detach: () => void = () => {};

  afterEach(() => {
    detach();
    document.body.innerHTML = '';
  });

  function setup() {
    const canvas = document.createElement('canvas');
    canvas.setPointerCapture = () => {};
    document.body.append(canvas);
    const update = vi.fn();
    detach = attachCameraInput(
      canvas,
      () => ({}) as Camera,
      update,
      () => false,
    );
    return { canvas, update };
  }

  function press(target: EventTarget, init: KeyboardEventInit) {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  }

  it('scrolls with arrows and W A S D', () => {
    const { canvas, update } = setup();
    for (const key of ['ArrowUp', 'a', 'S', 'ArrowRight']) {
      press(canvas, { key });
    }
    expect(update).toHaveBeenCalledTimes(4);
  });

  it('does not scroll while typing in a text field', () => {
    const { update } = setup();
    const input = document.createElement('input');
    document.body.append(input);
    for (const key of ['w', 'a', 's', 'd', 'ArrowLeft']) {
      press(input, { key });
    }
    expect(update).not.toHaveBeenCalled();
  });

  it('pans with the primary button only while Space is held', () => {
    const { canvas, update } = setup();
    const drag = (): void => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', { button: 0, clientX: 5, clientY: 5, bubbles: true }),
      );
      canvas.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 15, clientY: 5, bubbles: true }),
      );
    };
    drag();
    expect(update).not.toHaveBeenCalled();
    canvas.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    press(window, { key: ' ', code: 'Space' });
    drag();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
