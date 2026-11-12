import { act, cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandClient } from '../../net/commandClient';
import { Toasts, TOAST_DURATION_MS } from './Toasts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  const commands = new CommandClient({ send: () => true });
  render(<Toasts commands={commands} />);
  return commands;
}

function reject(commands: CommandClient, error: string): void {
  act(() => {
    commands.receive({
      t: 'commandResult',
      p: { id: 'x', ok: false, step: 1, error },
    } as never);
  });
}

describe('Toasts', () => {
  it('shows the Spanish reason for a rejected command', () => {
    const commands = setup();
    reject(commands, 'PRICE_LOCKED');
    expect(
      screen.getByText('El departamento ya está vendido. El precio no se puede cambiar.'),
    ).toBeTruthy();
  });

  it('shows a server error', () => {
    const commands = setup();
    act(() => {
      commands.receive({ t: 'error', p: { code: 'RATE_LIMITED', message: 'slow' } } as never);
    });
    expect(screen.getByText('Demasiadas órdenes seguidas. Esperá un momento.')).toBeTruthy();
  });

  it('does not show anything for an accepted command', () => {
    const commands = setup();
    act(() => {
      commands.receive({
        t: 'commandResult',
        p: { id: 'x', ok: true, step: 1, cost: 0, refund: 0 },
      } as never);
    });
    expect(screen.queryByRole('status')?.textContent).toBe('');
  });

  it('removes a toast after a few seconds', () => {
    vi.useFakeTimers();
    const commands = setup();
    reject(commands, 'UNKNOWN_ENTITY');
    expect(screen.getByText('Eso ya no está en la torre.')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(screen.queryByText('Eso ya no está en la torre.')).toBeNull();
  });

  it('lasts 3 seconds', () => {
    expect(TOAST_DURATION_MS).toBe(3000);
  });

  it('shows one toast at a time and the new one replaces the old', () => {
    vi.useFakeTimers();
    const commands = setup();
    reject(commands, 'UNKNOWN_ENTITY');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    reject(commands, 'PRICE_LOCKED');
    expect(document.querySelectorAll('.tm-toast').length).toBe(1);
    expect(screen.queryByText('Eso ya no est� en la torre.')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(document.querySelectorAll('.tm-toast').length).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.querySelectorAll('.tm-toast').length).toBe(0);
  });
});
