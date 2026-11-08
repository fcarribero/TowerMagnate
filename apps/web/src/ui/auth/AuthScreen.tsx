import {
  GAME_TITLE,
  PASSWORD_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  type AuthUser,
} from '@tower-magnate/shared';
import { useState } from 'preact/hooks';
import type { AuthApi, AuthFailure } from '../../api/authApi';
import { Button, TextField } from '../kit';
import { t, type StringKey } from '../strings';
import { hasErrors, validateLogin, validateRegister, type FieldErrors } from './authValidation';
import './auth.css';

export type AuthMode = 'login' | 'register';

export interface AuthScreenProps {
  api: AuthApi;
  onSignedIn: (user: AuthUser) => void;
  /** Shown above the form, for example after the session was closed. */
  notice?: StringKey;
  initialMode?: AuthMode;
}

interface FormError {
  fields: FieldErrors;
  /** A server message that belongs to no field; shown above the button. */
  general?: string;
}

const NO_ERRORS: FormError = { fields: {} };

export function AuthScreen({ api, onSignedIn, notice, initialMode = 'login' }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [error, setError] = useState<FormError>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const [showNotice, setShowNotice] = useState(notice !== undefined);
  const isLogin = mode === 'login';

  const switchMode = (): void => {
    setMode(isLogin ? 'register' : 'login');
    setPassword('');
    setPasswordRepeat('');
    setError(NO_ERRORS);
    setShowNotice(false);
  };

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (busy) {
      return;
    }
    const fields = isLogin
      ? validateLogin({ username, password })
      : validateRegister({ username, password, passwordRepeat });
    if (hasErrors(fields)) {
      setError({ fields });
      return;
    }
    setError(NO_ERRORS);
    setShowNotice(false);
    setBusy(true);
    const credentials = { username, password };
    const result = isLogin ? await api.login(credentials) : await api.register(credentials);
    setBusy(false);
    if (result.ok) {
      onSignedIn(result.user);
    } else {
      setError(errorForFailure(result));
    }
  };

  const fieldError = (key: StringKey | undefined): string | undefined =>
    key === undefined ? undefined : t(key);
  const title = t(isLogin ? 'auth.login.title' : 'auth.register.title');
  const submitLabel = isLogin
    ? t(busy ? 'auth.login.busy' : 'auth.login.submit')
    : t(busy ? 'auth.register.busy' : 'auth.register.submit');

  return (
    <div class="auth-screen">
      <h1 class="auth-screen__game-title">{GAME_TITLE}</h1>
      <section class="tm-window is-active auth-screen__window" aria-labelledby="auth-title">
        <header class="tm-window__title">
          <span id="auth-title" class="tm-window__title-text">
            {title}
          </span>
        </header>
        <form class="tm-window__body" noValidate onSubmit={submit}>
          {showNotice && notice !== undefined && (
            <p class="auth-screen__notice" role="status">
              {t(notice)}
            </p>
          )}
          <TextField
            id="auth-username"
            label={t('auth.username')}
            value={username}
            onChange={setUsername}
            maxLength={USERNAME_MAX_LENGTH}
            hint={isLogin ? undefined : t('auth.usernameHint')}
            error={fieldError(error.fields.username)}
            disabled={busy}
          />
          <TextField
            id="auth-password"
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={setPassword}
            maxLength={PASSWORD_MAX_LENGTH}
            hint={isLogin ? undefined : t('auth.passwordHint')}
            error={fieldError(error.fields.password)}
            disabled={busy}
          />
          {!isLogin && (
            <TextField
              id="auth-password-repeat"
              label={t('auth.passwordRepeat')}
              type="password"
              value={passwordRepeat}
              onChange={setPasswordRepeat}
              maxLength={PASSWORD_MAX_LENGTH}
              error={fieldError(error.fields.passwordRepeat)}
              disabled={busy}
            />
          )}
          {error.general !== undefined && (
            <p class="tm-field__error auth-screen__error" role="alert">
              {error.general}
            </p>
          )}
          <div class="auth-screen__actions">
            <Button type="submit" isDefault disabled={busy}>
              {submitLabel}
            </Button>
          </div>
          <button type="button" class="auth-screen__switch" onClick={switchMode} disabled={busy}>
            {t(isLogin ? 'auth.toRegister' : 'auth.toLogin')}
          </button>
        </form>
      </section>
    </div>
  );
}

function errorForFailure(failure: AuthFailure): FormError {
  switch (failure.reason) {
    case 'usernameTaken':
      return { fields: { username: 'auth.usernameTaken' } };
    case 'wrongCredentials':
      return { fields: {}, general: t('auth.wrongCredentials') };
    case 'rejected':
      return { fields: {}, general: failure.message };
    case 'rateLimited':
      return { fields: {}, general: t('auth.rateLimited') };
    case 'network':
      return { fields: {}, general: t('auth.networkError') };
  }
}
