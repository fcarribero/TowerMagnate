import { describe, expect, it } from 'vitest';
import {
  EMPTY_STACK,
  centeredPosition,
  clampPosition,
  closeWindow,
  cornerPosition,
  focusWindow,
  frontWindow,
  moveWindow,
  openWindow,
  type WindowStack,
} from './windowStack';

const origin = { x: 0, y: 0 };

function ids(stack: WindowStack): string[] {
  return stack.windows.map((window) => window.id);
}

function openMany(ids: string[], kind?: string): WindowStack {
  return ids.reduce((stack, id) => openWindow(stack, { id, kind, position: origin }), EMPTY_STACK);
}

describe('openWindow', () => {
  it('puts a new window at the front', () => {
    const stack = openMany(['finance', 'map']);
    expect(frontWindow(stack)?.id).toBe('map');
  });

  it('brings an open window to the front instead of opening it twice', () => {
    const stack = openWindow(openMany(['finance', 'map']), { id: 'finance', position: origin });
    expect(ids(stack)).toEqual(['map', 'finance']);
  });

  it('closes the oldest unit window when a fifth one opens', () => {
    const stack = openMany(['unit:1', 'unit:2', 'unit:3', 'unit:4', 'unit:5'], 'unit');
    expect(ids(stack)).toEqual(['unit:2', 'unit:3', 'unit:4', 'unit:5']);
  });

  it('counts age by opening order, not by stacking order', () => {
    let stack = openMany(['elevator:a', 'elevator:b'], 'elevator');
    stack = focusWindow(stack, 'elevator:a');
    stack = openWindow(stack, { id: 'elevator:c', kind: 'elevator', position: origin });
    expect(ids(stack)).toEqual(['elevator:b', 'elevator:c']);
  });

  it('leaves windows of other kinds alone', () => {
    let stack = openMany(['person:1', 'person:2', 'person:3', 'person:4'], 'person');
    stack = openWindow(stack, { id: 'finance', position: origin });
    expect(ids(stack)).toHaveLength(5);
  });

  it('reopens a closed window where it was last left', () => {
    let stack = openWindow(EMPTY_STACK, { id: 'map', position: origin });
    stack = moveWindow(stack, 'map', { x: 40, y: 30 });
    stack = closeWindow(stack, 'map');
    stack = openWindow(stack, { id: 'map', position: origin });
    expect(frontWindow(stack)?.position).toEqual({ x: 40, y: 30 });
  });
});

describe('closeWindow', () => {
  it('removes the window and ignores unknown ids', () => {
    const stack = openMany(['finance', 'map']);
    expect(ids(closeWindow(stack, 'map'))).toEqual(['finance']);
    expect(closeWindow(stack, 'nothing')).toBe(stack);
  });
});

describe('clampPosition', () => {
  const view = { width: 800, height: 600 };
  const size = { width: 200, height: 120 };

  it('keeps a position that is already inside', () => {
    expect(clampPosition({ x: 100, y: 50 }, size, view)).toEqual({ x: 100, y: 50 });
  });

  it('keeps 24 px of the title bar inside on the left and right', () => {
    expect(clampPosition({ x: -500, y: 10 }, size, view).x).toBe(24 - 200);
    expect(clampPosition({ x: 5000, y: 10 }, size, view).x).toBe(800 - 24);
  });

  it('keeps the title bar below the top and 12 px above the bottom', () => {
    expect(clampPosition({ x: 0, y: -40 }, size, view).y).toBe(0);
    expect(clampPosition({ x: 0, y: 900 }, size, view).y).toBe(600 - 12);
  });
});

describe('dialogs on top', () => {
  it('keeps an on-top window in front when another window is focused or opened', () => {
    let stack = openWindow(openMany(['finance']), { id: 'bomb', onTop: true });
    stack = focusWindow(stack, 'finance');
    expect(ids(stack)).toEqual(['finance', 'bomb']);
    stack = openWindow(stack, { id: 'map', position: origin });
    expect(ids(stack)).toEqual(['finance', 'map', 'bomb']);
  });

  it('orders on-top windows among themselves by focus', () => {
    let stack = openWindow(EMPTY_STACK, { id: 'bomb', onTop: true });
    stack = openWindow(stack, { id: 'fire', onTop: true });
    stack = focusWindow(stack, 'bomb');
    expect(ids(stack)).toEqual(['fire', 'bomb']);
  });
});

describe('centered windows', () => {
  it('opens without a position as waiting to be centered until moved', () => {
    let stack = openWindow(EMPTY_STACK, { id: 'newTower', onTop: true });
    expect(stack.windows[0]?.pendingPlacement).toEqual({ kind: 'center' });
    stack = moveWindow(stack, 'newTower', { x: 10, y: 20 });
    expect(stack.windows[0]?.pendingPlacement).toBeNull();
  });

  it('centers again when reopened instead of coming back where it was', () => {
    let stack = openWindow(EMPTY_STACK, { id: 'newTower', onTop: true });
    stack = moveWindow(stack, 'newTower', { x: 10, y: 20 });
    stack = openWindow(closeWindow(stack, 'newTower'), { id: 'newTower', onTop: true });
    expect(stack.windows[0]?.pendingPlacement).toEqual({ kind: 'center' });
  });

  it('computes the centered position in whole pixels', () => {
    expect(centeredPosition({ width: 201, height: 100 }, { width: 800, height: 600 })).toEqual({
      x: 299,
      y: 250,
    });
    expect(centeredPosition({ width: 900, height: 100 }, { width: 800, height: 600 }).x).toBe(0);
  });
});

describe('clampPosition at a larger UI scale', () => {
  it('keeps the title bar margins in UI pixels', () => {
    const view = { width: 2000, height: 1000 };
    expect(clampPosition({ x: 5000, y: 5000 }, { width: 400, height: 200 }, view, 2)).toEqual({
      x: 2000 - 48,
      y: 1000 - 24,
    });
  });
});

describe('corner windows', () => {
  it('waits for a corner placement and remembers where it was left', () => {
    let stack = openWindow(EMPTY_STACK, { id: 'stars', corner: 'topLeft' });
    expect(stack.windows[0]?.pendingPlacement).toEqual({
      kind: 'corner',
      corner: 'topLeft',
      belowId: undefined,
    });
    stack = moveWindow(stack, 'stars', { x: 50, y: 60 });
    stack = openWindow(closeWindow(stack, 'stars'), { id: 'stars', corner: 'topLeft' });
    expect(stack.windows[0]?.position).toEqual({ x: 50, y: 60 });
    expect(stack.windows[0]?.pendingPlacement).toBeNull();
  });

  it('puts a window 8 pixels from the top right corner', () => {
    expect(
      cornerPosition('topRight', { width: 200, height: 100 }, { width: 800, height: 600 }, 8),
    ).toEqual({
      x: 592,
      y: 8,
    });
  });

  it('puts a window 8 pixels from the top left corner and lets it start lower', () => {
    expect(
      cornerPosition('topLeft', { width: 200, height: 100 }, { width: 800, height: 600 }, 8, 120),
    ).toEqual({
      x: 8,
      y: 120,
    });
  });
});
