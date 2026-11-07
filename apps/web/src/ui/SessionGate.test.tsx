import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthApi, SessionCheck } from '../api/authApi';
import { SessionGate } from './SessionGate';

afterEach(cleanup);

const user = { id: 3, username: 'ana_42' };

function fakeApi(check: SessionCheck): AuthApi {
  return {
    currentUser: vi.fn(async () => check),
    login: vi.fn(async () => ({ ok: true as const, user })),
    register: vi.fn(async () => ({ ok: true as const, user })),
    logout: vi.fn(async () => {}),
  };
}

function renderGate(api: AuthApi) {
  return render(
    <SessionGate api={api}>
      {({ user: signedIn, logout }) => (
        <div>
          <p>Juego de {signedIn.username}</p>
          <button type="button" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      )}
    </SessionGate>,
  );
}

describe('SessionGate', () => {
  it('waits for the session check before showing anything else', () => {
    const api = fakeApi({ status: 'signedOut' });
    api.currentUser = vi.fn(() => new Promise<SessionCheck>(() => {}));
    renderGate(api);
    expect(screen.getByText('Conectando...')).toBeTruthy();
  });

  it('sends a player with a session cookie straight to the game', async () => {
    renderGate(fakeApi({ status: 'signedIn', user }));
    expect(await screen.findByText('Juego de ana_42')).toBeTruthy();
  });

  it('sends everyone else to the login screen and into the game after login', async () => {
    const ui = userEvent.setup();
    renderGate(fakeApi({ status: 'signedOut' }));

    await ui.type(await screen.findByLabelText('Usuario'), 'ana_42');
    await ui.type(screen.getByLabelText('Contraseña'), 'secreto123{Enter}');

    expect(await screen.findByText('Juego de ana_42')).toBeTruthy();
  });

  it('logs out and returns to the login screen', async () => {
    const ui = userEvent.setup();
    const api = fakeApi({ status: 'signedIn', user });
    renderGate(api);

    await ui.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(api.logout).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeTruthy();
  });

  it('explains on the login screen when the server cannot be reached', async () => {
    renderGate(fakeApi({ status: 'unreachable' }));
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toBe('No se pudo conectar. Probá de nuevo.');
  });
});
