import { act, renderHook } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { isViewportTooSmall, uiScaleFor, useUiScale } from './uiScale';

function resizeTo(width: number, height: number): void {
  Object.assign(window, { innerWidth: width, innerHeight: height });
  window.dispatchEvent(new Event('resize'));
}

describe('uiScaleFor', () => {
  it('is 1 from 1024 x 640 up to just below twice that', () => {
    expect(uiScaleFor(1024, 640)).toBe(1);
    expect(uiScaleFor(2047, 1279)).toBe(1);
  });

  it('steps up only when both sides fit the next whole scale', () => {
    expect(uiScaleFor(2048, 1280)).toBe(2);
    expect(uiScaleFor(4000, 1279)).toBe(1);
    expect(uiScaleFor(3072, 1920)).toBe(3);
  });

  it('stays between 1 and 3', () => {
    expect(uiScaleFor(800, 500)).toBe(1);
    expect(uiScaleFor(8000, 5000)).toBe(3);
  });
});

describe('isViewportTooSmall', () => {
  it('is true below 1024 x 640 on either side', () => {
    expect(isViewportTooSmall(1023, 800)).toBe(true);
    expect(isViewportTooSmall(1280, 639)).toBe(true);
    expect(isViewportTooSmall(1024, 640)).toBe(false);
  });
});

describe('useUiScale', () => {
  afterEach(() => resizeTo(1024, 768));

  it('follows resizes and publishes the CSS variable', () => {
    resizeTo(1280, 800);
    const { result } = renderHook(() => useUiScale());
    expect(result.current).toEqual({ scale: 1, tooSmall: false });
    expect(document.documentElement.style.getPropertyValue('--tm-ui-scale')).toBe('1');

    act(() => resizeTo(2560, 1440));
    expect(result.current).toEqual({ scale: 2, tooSmall: false });
    expect(document.documentElement.style.getPropertyValue('--tm-ui-scale')).toBe('2');

    act(() => resizeTo(900, 600));
    expect(result.current).toEqual({ scale: 1, tooSmall: true });
  });
});
