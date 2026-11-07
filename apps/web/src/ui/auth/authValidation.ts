import {
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@tower-magnate/shared';
import type { StringKey } from '../strings';

export type AuthField = 'username' | 'password' | 'passwordRepeat';

export type FieldErrors = Partial<Record<AuthField, StringKey>>;

export interface LoginInput {
  username: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  passwordRepeat: string;
}

const USERNAME_PATTERN = /^[a-z0-9_]+$/;

/** Login only checks that both fields are filled; the server decides the rest. */
export function validateLogin(input: LoginInput): FieldErrors {
  const errors: FieldErrors = {};
  if (input.username === '') {
    errors.username = 'auth.required';
  }
  if (input.password === '') {
    errors.password = 'auth.required';
  }
  return errors;
}

export function validateRegister(input: RegisterInput): FieldErrors {
  const errors: FieldErrors = {};
  const usernameError = checkUsername(input.username);
  if (usernameError !== undefined) {
    errors.username = usernameError;
  }
  const passwordError = checkNewPassword(input.password);
  if (passwordError !== undefined) {
    errors.password = passwordError;
  }
  if (input.passwordRepeat === '') {
    errors.passwordRepeat = 'auth.required';
  } else if (input.passwordRepeat !== input.password) {
    errors.passwordRepeat = 'auth.passwordMismatch';
  }
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

function checkUsername(username: string): StringKey | undefined {
  if (username === '') {
    return 'auth.required';
  }
  const lengthOk = username.length >= USERNAME_MIN_LENGTH && username.length <= USERNAME_MAX_LENGTH;
  if (!lengthOk || !USERNAME_PATTERN.test(username)) {
    return 'auth.usernameInvalid';
  }
  return undefined;
}

function checkNewPassword(password: string): StringKey | undefined {
  if (password === '') {
    return 'auth.required';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return 'auth.passwordShort';
  }
  return undefined;
}
