import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { serverMessage, type StarRating } from '@tower-magnate/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientStore } from '../../model/clientStore';
import { delta, snapshot } from '../../testing/protocolFixtures';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { WindowLayer } from '../kit/WindowLayer';
import { StarsWindow } from './StarsWindow';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 220, offsetHeight: 160 });

afterEach(cleanup);

function renderWindow(stars: StarRating, population: number) {
  const store = new ClientStore({ requestResync: () => undefined });
  store.applySnapshot({ ...snapshot, stars, population });
  const onClose = vi.fn();
  render(
    <WindowLayer>
      <StarsWindow store={store} onClose={onClose} />
    </WindowLayer>,
  );
  return { store, onClose };
}

describe('StarsWindow', () => {
  it('shows the 2 star step at 1 star with population 120', () => {
    renderWindow(1, 120);
    expect(screen.getByText('Estrellas')).toBeTruthy();
    expect(screen.getByText('Rango actual: 1 estrellas')).toBeTruthy();
    expect(screen.getByText('Para 2 estrellas:')).toBeTruthy();
    expect(screen.getByText('Población de 300.')).toBeTruthy();
    expect(screen.getByText('Población 120 de 300')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('120');
  });

  it('shows the 4 star step and target at 3 stars', () => {
    renderWindow(3, 2000);
    expect(screen.getByText('Para 4 estrellas:')).toBeTruthy();
    expect(screen.getByText(/^Población de 5\.000, visita del VIP/)).toBeTruthy();
    expect(screen.getByText('Población 2.000 de 5.000')).toBeTruthy();
  });

  it('shows the Torre step at 5 stars', () => {
    renderWindow(5, 12000);
    expect(screen.getByText('Para el rango Torre:')).toBeTruthy();
    expect(screen.getByText('Población 12.000 de 15.000')).toBeTruthy();
  });

  it('shows the max rank line at Torre', () => {
    renderWindow(6, 20000);
    expect(screen.getByText('Rango actual: Torre')).toBeTruthy();
    expect(screen.getByText('La torre llegó al rango máximo.')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('updates the bar after a delta without reopening', () => {
    const { store } = renderWindow(1, 120);
    act(() => {
      store.receive(serverMessage('delta', delta({ step: snapshot.step + 1, population: 210 })));
    });
    expect(screen.getByText('Población 210 de 300')).toBeTruthy();
  });

  it('closes with the close button', () => {
    const { onClose } = renderWindow(1, 120);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalled();
  });
});
