import { describe, expect, it } from 'vitest';
import { hasErrors, validateLogin, validateRegister } from './authValidation';

describe('validateLogin', () => {
  it('asks for both fields', () => {
    expect(validateLogin({ username: '', password: '' })).toEqual({
      username: 'auth.required',
      password: 'auth.required',
    });
  });

  it('leaves the rules to the server once both are filled', () => {
    expect(hasErrors(validateLogin({ username: 'X', password: 'y' }))).toBe(false);
  });
});

describe('validateRegister', () => {
  const valid = { username: 'ana_42', password: 'secreto123', passwordRepeat: 'secreto123' };

  it('accepts a valid account', () => {
    expect(validateRegister(valid)).toEqual({});
  });

  it.each(['ab', 'a'.repeat(21), 'Ana', 'ana perez', 'añil'])(
    'rejects the username %j',
    (username) => {
      expect(validateRegister({ ...valid, username }).username).toBe('auth.usernameInvalid');
    },
  );

  it('accepts usernames of exactly 3 and 20 characters', () => {
    expect(validateRegister({ ...valid, username: 'abc' })).toEqual({});
    expect(validateRegister({ ...valid, username: 'a'.repeat(20) })).toEqual({});
  });

  it('wants a password of at least 8 characters', () => {
    const errors = validateRegister({ ...valid, password: 'corto12', passwordRepeat: 'corto12' });
    expect(errors).toEqual({ password: 'auth.passwordShort' });
  });

  it('wants the repeated password to match', () => {
    expect(validateRegister({ ...valid, passwordRepeat: 'otracosa1' })).toEqual({
      passwordRepeat: 'auth.passwordMismatch',
    });
  });

  it('marks every empty field as required', () => {
    expect(validateRegister({ username: '', password: '', passwordRepeat: '' })).toEqual({
      username: 'auth.required',
      password: 'auth.required',
      passwordRepeat: 'auth.required',
    });
  });
});
