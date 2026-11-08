import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { serverMessage, type ClientEvent, type ServerMessage } from '@tower-magnate/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { snapshot } from '../../testing/protocolFixtures';
import { WindowLayer } from '../kit/WindowLayer';
import { InfoDialogs } from './InfoDialogs';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 260, offsetHeight: 140 });

afterEach(cleanup);

function renderDialogs() {
  const listeners = new Set<(message: ServerMessage) => void>();
  const subscribe = (listener: (message: ServerMessage) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  render(
    <WindowLayer>
      <InfoDialogs subscribe={subscribe} />
    </WindowLayer>,
  );
  const send = (message: ServerMessage): void => {
    act(() => {
      for (const listener of listeners) {
        listener(message);
      }
    });
  };
  const sendEvents = (events: ClientEvent[]): void => send(serverMessage('events', { events }));
  return { send, sendEvents };
}

const newTower = { ...snapshot, step: 0, units: [], notices: [] };

describe('InfoDialogs', () => {
  it('opens the new stars dialog with the units unlocked at 3 stars', () => {
    const { sendEvents } = renderDialogs();

    sendEvents([{ type: 'starsChanged', step: 200, stars: 3 }]);

    expect(screen.getByText('¡3 estrellas!')).toBeTruthy();
    expect(
      screen.getByText(/Ahora podés construir: Restaurante, Local comercial, Cine/),
    ).toBeTruthy();
  });

  it('shows two events of one batch one after the other', () => {
    const { sendEvents } = renderDialogs();

    sendEvents([
      { type: 'starsChanged', step: 200, stars: 5 },
      { type: 'weddingCompleted', step: 200 },
    ]);

    expect(screen.getByText('¡5 estrellas!')).toBeTruthy();
    expect(screen.queryByText('¡Rango Torre!')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(screen.queryByText('¡5 estrellas!')).toBeNull();
    expect(screen.getByText('¡Rango Torre!')).toBeTruthy();
  });

  it('closes with the close button', () => {
    const { sendEvents } = renderDialogs();
    sendEvents([{ type: 'weddingCompleted', step: 200 }]);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(screen.queryByText('¡Rango Torre!')).toBeNull();
  });

  it('focuses Aceptar so Enter confirms', () => {
    const { sendEvents } = renderDialogs();
    sendEvents([{ type: 'weddingCompleted', step: 200 }]);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Aceptar' }));
  });

  it('does not open anything for a snapshot of a running tower', () => {
    const { send } = renderDialogs();

    send(serverMessage('snapshot', snapshot));

    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull();
  });

  it('welcomes a new tower once', () => {
    const { send } = renderDialogs();

    send(serverMessage('snapshot', newTower));
    expect(screen.getByText('Bienvenida')).toBeTruthy();
    expect(screen.getByText(/^Tenés \$2\.000\.000 para empezar/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    send(serverMessage('snapshot', newTower));

    expect(screen.queryByText('Bienvenida')).toBeNull();
  });
});
