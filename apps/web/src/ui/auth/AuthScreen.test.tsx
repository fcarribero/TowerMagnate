import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthApi, AuthResult } from '../../api/authApi';
import { AuthScreen } from './AuthScreen';

afterEach(cleanup);

const user = { id: 1, username: 'ana_42' };

function fakeApi(result: AuthResult = { ok: true, user }): AuthApi {
  return {
    currentUser: vi.fn(),
    login: vi.fn(async () => result),
    register: vi.fn(async () => result),
    logout: vi.fn(async () => {}),
  };
}

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label);
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name });
}

describe('AuthScreen', () => {
  it('logs in with Enter and hands over the user', async () => {
    const ui = userEvent.setup();
    const api = fakeApi();
    const onSignedIn = vi.fn();
    render(<AuthScreen api={api} onSignedIn={onSignedIn} />);

    await ui.type(input('Usuario'), 'ana_42');
    await ui.type(input('Contraseña'), 'secreto123{Enter}');

    expect(api.login).toHaveBeenCalledWith({ username: 'ana_42', password: 'secreto123' });
    expect(onSignedIn).toHaveBeenCalledWith(user);
  });

  it('shows Spanish messages under empty fields and sends nothing', async () => {
    const ui = userEvent.setup();
    const api = fakeApi();
    render(<AuthScreen api={api} onSignedIn={vi.fn()} />);

    await ui.click(button('Entrar'));

    expect(screen.getAllByText('Completá este campo.')).toHaveLength(2);
    expect(input('Usuario').getAttribute('aria-invalid')).toBe('true');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('shows a wrong password above the button', async () => {
    const ui = userEvent.setup();
    const onSignedIn = vi.fn();
    render(
      <AuthScreen
        api={fakeApi({ ok: false, reason: 'wrongCredentials' })}
        onSignedIn={onSignedIn}
      />,
    );

    await ui.type(input('Usuario'), 'ana_42');
    await ui.type(input('Contraseña'), 'equivocada{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Usuario o contraseña incorrectos.');
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('disables the form and renames the button while the request runs', async () => {
    const ui = userEvent.setup();
    let finish: (result: AuthResult) => void = () => {};
    const api = fakeApi();
    api.login = vi.fn(
      () =>
        new Promise<AuthResult>((resolve) => {
          finish = resolve;
        }),
    );
    render(<AuthScreen api={api} onSignedIn={vi.fn()} />);

    await ui.type(input('Usuario'), 'ana_42');
    await ui.type(input('Contraseña'), 'secreto123{Enter}');

    expect(button('Entrando...').disabled).toBe(true);
    expect(input('Usuario').disabled).toBe(true);
    finish({ ok: false, reason: 'network' });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('No se pudo conectar. Probá de nuevo.');
    expect(button('Entrar').disabled).toBe(false);
  });

  it('shows the rate-limit message when the server answers 429', async () => {
    const ui = userEvent.setup();
    const api = fakeApi();
    api.login = vi.fn(async () => ({ ok: false, reason: 'rateLimited' }) as const);
    render(<AuthScreen api={api} onSignedIn={vi.fn()} />);

    await ui.type(input('Usuario'), 'ana_42');
    await ui.type(input('Contraseña'), 'secreto123{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Hiciste demasiados intentos. Esperá un minuto y probá de nuevo.',
    );
  });

  it('switches to the register form with its hints', async () => {
    const ui = userEvent.setup();
    render(<AuthScreen api={fakeApi()} onSignedIn={vi.fn()} />);

    await ui.click(button('¿No tenés cuenta? Creá una'));

    expect(screen.getByText('Crear cuenta', { selector: 'span' })).toBeTruthy();
    expect(input('Repetir contraseña')).toBeTruthy();
    expect(screen.getByText('De 3 a 20 caracteres: a-z, 0-9 y _')).toBeTruthy();
    expect(screen.getByText('Al menos 8 caracteres')).toBeTruthy();
  });

  it('validates the register form before calling the server', async () => {
    const ui = userEvent.setup();
    const api = fakeApi();
    render(<AuthScreen api={api} onSignedIn={vi.fn()} initialMode="register" />);

    await ui.type(input('Usuario'), 'Ana');
    await ui.type(input('Contraseña'), 'corto');
    await ui.type(input('Repetir contraseña'), 'otra');
    await ui.click(button('Crear cuenta'));

    expect(
      screen.getByText('El usuario lleva de 3 a 20 caracteres: letras minúsculas, números o _.'),
    ).toBeTruthy();
    expect(screen.getByText('La contraseña lleva al menos 8 caracteres.')).toBeTruthy();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('puts a taken username under the username field', async () => {
    const ui = userEvent.setup();
    const onSignedIn = vi.fn();
    render(
      <AuthScreen
        api={fakeApi({ ok: false, reason: 'usernameTaken' })}
        onSignedIn={onSignedIn}
        initialMode="register"
      />,
    );

    await ui.type(input('Usuario'), 'ana_42');
    await ui.type(input('Contraseña'), 'secreto123');
    await ui.type(input('Repetir contraseña'), 'secreto123{Enter}');

    const message = await screen.findByText('Ese usuario ya existe. Probá con otro.');
    expect(message.id).toBe('auth-username-error');
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('shows a notice above the form until the player submits', async () => {
    const ui = userEvent.setup();
    render(<AuthScreen api={fakeApi()} onSignedIn={vi.fn()} notice="auth.sessionClosed" />);
    expect(screen.getByRole('status').textContent).toBe('La sesión se cerró. Entrá de nuevo.');

    await ui.type(input('Usuario'), 'ana_42');
    await ui.type(input('Contraseña'), 'secreto123{Enter}');

    expect(screen.queryByRole('status')).toBeNull();
  });
});
