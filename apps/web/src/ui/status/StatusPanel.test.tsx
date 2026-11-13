import { STEPS_PER_MINUTE, stepOfDate } from '@tower-magnate/engine/calendar';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientStore } from '../../model/clientStore';
import { delta, snapshot } from '../../testing/protocolFixtures';
import { StatusPanel, type StatusPanelProps } from './StatusPanel';

afterEach(cleanup);

function storeAt(fields: Partial<typeof snapshot> = {}): ClientStore {
  const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
  store.applySnapshot({ ...snapshot, ...fields });
  return store;
}

function renderPanel(store: ClientStore, props: Partial<StatusPanelProps> = {}) {
  const handlers = {
    onOpenWindow: vi.fn(),
    onLogout: vi.fn(),
  };
  render(<StatusPanel store={store} {...handlers} {...props} />);
  return handlers;
}

function text(selector: string): string {
  return document.querySelector(selector)?.textContent ?? '';
}

describe('StatusPanel', () => {
  it('shows the first moment of a new tower', () => {
    renderPanel(storeAt({ step: 0, money: 2_000_000, population: 0, stars: 1 }));
    expect(text('.status-panel__day')).toBe('Lunes 1 de enero, año 1');
    expect(text('.status-panel__time')).toBe('00:00');
    expect(text('.status-panel__money')).toBe('$2.000.000');
    expect(text('.status-panel__population')).toBe('Población 0');
  });

  it('draws a negative balance in red', () => {
    renderPanel(storeAt({ money: -12_500 }));
    const money = document.querySelector('.status-panel__money');
    expect(money?.textContent).toBe('-$12.500');
    expect(money?.classList.contains('is-negative')).toBe(true);
  });

  it('marks a Saturday date as weekend', () => {
    renderPanel(storeAt({ step: stepOfDate({ year: 1, month: 1, day: 6, hour: 8 }) }));
    const date = document.querySelector('.status-panel__day');
    expect(date?.textContent).toBe('Sábado 6 de enero, año 1');
    const tag = document.querySelector('.status-panel__weekday');
    expect(tag?.textContent).toBe('Sábado');
    expect(tag?.classList.contains('is-weekend')).toBe(true);
  });

  it('leaves the weekday untagged on a Monday', () => {
    renderPanel(storeAt({ step: 0 }));
    expect(document.querySelector('.status-panel__weekday.is-weekend')).toBeNull();
  });

  it('writes the population label apart from its number', () => {
    renderPanel(storeAt({ population: 1234 }));
    expect(text('.status-panel__label')).toBe('Población');
    expect(text('.status-panel__population')).toBe('Población 1.234');
  });

  it('shows the unread count on Avisos only', () => {
    renderPanel(storeAt(), { unreadNotices: 3 });
    expect(text('.status-panel__badge')).toBe('3');
    expect(
      screen.getByRole('button', { name: 'Avisos' }).querySelector('.status-panel__badge'),
    ).not.toBeNull();
    expect(document.querySelectorAll('.status-panel__badge')).toHaveLength(1);
  });

  it('caps the badge at 9+ and hides it at zero', () => {
    renderPanel(storeAt(), { unreadNotices: 25 });
    expect(text('.status-panel__badge')).toBe('9+');
    cleanup();
    renderPanel(storeAt(), { unreadNotices: 0 });
    expect(document.querySelector('.status-panel__badge')).toBeNull();
  });

  it('presses the buttons of open windows', () => {
    renderPanel(storeAt(), { openWindows: new Set(['finance']) });
    expect(screen.getByRole('button', { name: 'Finanzas' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Mapa' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('fills stars up to the rating', () => {
    renderPanel(storeAt({ stars: 3 }));
    expect(document.querySelectorAll('.status-panel__star.is-filled')).toHaveLength(3);
    expect(document.querySelectorAll('.status-panel__star')).toHaveLength(5);
    expect(screen.queryByText('TORRE')).toBeNull();
  });

  it('words the star button title and label in singular at 1 star and plural at 2', () => {
    renderPanel(storeAt({ stars: 1 }));
    const single = screen.getByRole('button', { name: 'Rango actual: 1 estrella' });
    expect(single.getAttribute('title')).toBe('Rango actual: 1 estrella');
    cleanup();
    renderPanel(storeAt({ stars: 2 }));
    const plural = screen.getByRole('button', { name: 'Rango actual: 2 estrellas' });
    expect(plural.getAttribute('title')).toBe('Rango actual: 2 estrellas');
  });

  it('shows 5 filled stars and TORRE at rank 6', () => {
    renderPanel(storeAt({ stars: 6 }));
    expect(document.querySelectorAll('.status-panel__star.is-filled')).toHaveLength(5);
    expect(screen.getByText('TORRE')).toBeTruthy();
  });

  it('updates money and population on every delta and the time every game minute', () => {
    const store = storeAt({ step: 0, money: 1000, population: 5 });
    renderPanel(store);

    act(() => store.applyDelta(delta({ step: 1, money: 900, population: 7 })));
    expect(text('.status-panel__money')).toBe('$900');
    expect(text('.status-panel__population')).toBe('Población 7');
    expect(text('.status-panel__time')).toBe('00:00');

    act(() => store.applyDelta(delta({ step: STEPS_PER_MINUTE })));
    expect(text('.status-panel__time')).toBe('00:01');
  });

  it('opens windows from its buttons', () => {
    const handlers = renderPanel(storeAt());
    fireEvent.click(screen.getByRole('button', { name: 'Finanzas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mapa' }));
    fireEvent.click(screen.getByRole('button', { name: /Rango actual/ }));
    expect(handlers.onOpenWindow.mock.calls).toEqual([['finance'], ['map'], ['stars']]);
  });

  it('logs out from the menu', () => {
    const handlers = renderPanel(storeAt());
    fireEvent.click(screen.getByRole('button', { name: 'Menú' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    expect(handlers.onLogout).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the menu but no values before the first snapshot', () => {
    const store = new ClientStore({ requestResync: () => undefined });
    renderPanel(store);
    expect(screen.getByRole('button', { name: 'Menú' })).toBeTruthy();
    expect(document.querySelector('.status-panel__date')).toBeNull();
  });
});
