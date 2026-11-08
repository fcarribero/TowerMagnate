import { act, renderHook } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { useBuildFeedback } from './useBuildFeedback';

describe('useBuildFeedback', () => {
  it('floats the refund of a demolition as a gain', () => {
    const { result } = renderHook(() => useBuildFeedback());
    act(() => result.current.report({ ok: true, cost: 0, refund: 40_000 }, { x: 1, y: 2 }));
    expect(result.current.floats).toMatchObject([{ text: '+$40.000', kind: 'refund' }]);
  });

  it('floats nothing for a demolition without refund', () => {
    const { result } = renderHook(() => useBuildFeedback());
    act(() => result.current.report({ ok: true, cost: 0, refund: 0 }, { x: 1, y: 2 }));
    expect(result.current.floats).toEqual([]);
  });

  it('toasts the unknown message for a code without text', () => {
    const { result } = renderHook(() => useBuildFeedback());
    act(() => result.current.report({ ok: false, error: 'WHATEVER' }, { x: 1, y: 2 }));
    expect(result.current.toasts[0]?.text).toBe('No se pudo hacer.');
  });
});
