import { describe, expect, it } from 'vitest';
import { isMapToggleKey, type KeyPress } from './keys';

function press(key: string, extra: Partial<KeyPress> = {}): KeyPress {
  return { key, ctrlKey: false, altKey: false, metaKey: false, target: null, ...extra };
}

describe('isMapToggleKey', () => {
  it('accepts M in either case', () => {
    expect(isMapToggleKey(press('m'))).toBe(true);
    expect(isMapToggleKey(press('M'))).toBe(true);
  });

  it('ignores other keys and shortcuts', () => {
    expect(isMapToggleKey(press('n'))).toBe(false);
    expect(isMapToggleKey(press('m', { ctrlKey: true }))).toBe(false);
  });

  it('ignores typing in a text field', () => {
    const input = { tagName: 'INPUT' } as unknown as EventTarget;
    expect(isMapToggleKey(press('m', { target: input }))).toBe(false);
  });
});
