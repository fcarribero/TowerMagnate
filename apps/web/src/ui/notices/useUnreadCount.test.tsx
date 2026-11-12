import { act, cleanup, renderHook } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { Notice } from './noticeModel';
import { useUnreadCount } from './useUnreadCount';

afterEach(cleanup);

const notice: Notice = {
  id: 'n1',
  step: 0,
  key: 'news.test',
  params: {},
  unitId: null,
  alert: false,
};

function makeLine() {
  const listeners = new Set<(notice: Notice) => void>();
  return {
    subscribe: (listener: (notice: Notice) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: () => listeners.forEach((listener) => listener(notice)),
  };
}

describe('useUnreadCount', () => {
  it('counts notices while Avisos is closed', () => {
    const line = makeLine();
    const { result } = renderHook(() => useUnreadCount(line.subscribe, false));
    act(() => line.emit());
    act(() => line.emit());
    expect(result.current).toBe(2);
  });

  it('clears the count when Avisos opens and ignores notices while it is open', () => {
    const line = makeLine();
    const { result, rerender } = renderHook(({ open }) => useUnreadCount(line.subscribe, open), {
      initialProps: { open: false },
    });
    act(() => line.emit());
    rerender({ open: true });
    expect(result.current).toBe(0);
    act(() => line.emit());
    expect(result.current).toBe(0);
    rerender({ open: false });
    act(() => line.emit());
    expect(result.current).toBe(1);
  });
});
