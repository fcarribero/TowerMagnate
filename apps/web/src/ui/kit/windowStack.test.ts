import { describe, expect, it } from 'vitest';
import {
  EMPTY_STACK,
  clampPosition,
  closeWindow,
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
