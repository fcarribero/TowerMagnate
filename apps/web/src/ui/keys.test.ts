import { describe, expect, it } from 'vitest';
import { isFinanceToggleKey, isMapToggleKey, isPlainShortcut, type KeyPress } from './keys';

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

describe('isFinanceToggleKey', () => {
  it('accepts F in either case', () => {
    expect(isFinanceToggleKey(press('f'))).toBe(true);
    expect(isFinanceToggleKey(press('F'))).toBe(true);
  });

  it('ignores shortcuts and typing in a text field', () => {
    const input = { tagName: 'INPUT' } as unknown as EventTarget;
    expect(isFinanceToggleKey(press('f', { ctrlKey: true }))).toBe(false);
    expect(isFinanceToggleKey(press('f', { target: input }))).toBe(false);
  });
});

describe('isPlainShortcut', () => {
  it('accepts a digit on the page', () => {
    expect(isPlainShortcut(press('1'))).toBe(true);
  });

  it('ignores digits typed in text, number and select fields', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      const target = { tagName } as unknown as EventTarget;
      expect(isPlainShortcut(press('1', { target }))).toBe(false);
    }
  });
});
