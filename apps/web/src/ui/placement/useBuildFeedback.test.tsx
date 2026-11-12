import { act, cleanup, render, renderHook, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastHost, clearToast, showToast } from '../kit';
import { useBuildFeedback } from './useBuildFeedback';

afterEach(() => {
  act(() => clearToast());
  cleanup();
});

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
    render(<ToastHost />);
    const { result } = renderHook(() => useBuildFeedback());
    act(() => result.current.report({ ok: false, error: 'WHATEVER' }, { x: 1, y: 2 }));
    expect(screen.getByText('No se pudo hacer.')).toBeTruthy();
  });

  it('shares one toast slot with the rejection toasts', () => {
    render(<ToastHost />);
    const { result } = renderHook(() => useBuildFeedback());
    act(() => {
      showToast('Del servidor');
      result.current.report({ ok: false, error: 'WHATEVER' }, { x: 1, y: 2 });
    });
    expect(document.querySelectorAll('.tm-toast')).toHaveLength(1);
    expect(screen.getByText('No se pudo hacer.')).toBeTruthy();
  });
});
