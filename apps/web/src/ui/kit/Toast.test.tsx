import { act, cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DURATION_MS, ToastHost, clearToast, showToast } from './Toast';

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  act(() => clearToast());
  cleanup();
  vi.useRealTimers();
});

const boxes = (): number => document.querySelectorAll('.tm-toast').length;

describe('Toast slot', () => {
  it('lasts 3 seconds', () => {
    expect(TOAST_DURATION_MS).toBe(3000);
  });

  it('shows a toast for 3 seconds and then removes it', () => {
    render(<ToastHost />);
    act(() => showToast('Sin plata.'));
    expect(screen.getByText('Sin plata.')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(boxes()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(boxes()).toBe(0);
  });

  it('leaves only the second toast when two come in the same frame', () => {
    render(<ToastHost />);
    act(() => {
      showToast('Primero');
      showToast('Segundo');
    });
    expect(boxes()).toBe(1);
    expect(screen.queryByText('Primero')).toBeNull();
    expect(screen.getByText('Segundo')).toBeTruthy();
  });

  it('restarts the 3 second timer when a toast replaces another', () => {
    render(<ToastHost />);
    act(() => showToast('Primero'));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => showToast('Segundo'));
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByText('Segundo')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(boxes()).toBe(0);
  });

  it('shows a toast that was raised before the host mounted', () => {
    showToast('Antes');
    render(<ToastHost />);
    expect(screen.getByText('Antes')).toBeTruthy();
  });
});
