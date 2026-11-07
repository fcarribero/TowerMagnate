import { describe, expect, it } from 'vitest';
import { credentialsSchema } from './auth';

function firstError(input: unknown): string | undefined {
  const result = credentialsSchema.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('credentialsSchema', () => {
  it('accepts a valid username and password', () => {
    expect(credentialsSchema.parse({ username: 'ana_92', password: 'secreto123' })).toEqual({
      username: 'ana_92',
      password: 'secreto123',
    });
  });

  it('accepts usernames of exactly 3 and 20 characters', () => {
    expect(firstError({ username: 'abc', password: '12345678' })).toBeUndefined();
    expect(firstError({ username: 'a'.repeat(20), password: '12345678' })).toBeUndefined();
  });

  it('rejects usernames that are too short or too long in Spanish', () => {
    expect(firstError({ username: 'ab', password: '12345678' })).toMatch(/al menos 3/);
    expect(firstError({ username: 'a'.repeat(21), password: '12345678' })).toMatch(/máximo 20/);
  });

  it('rejects uppercase letters, spaces and symbols in the username', () => {
    for (const username of ['Ana', 'ana maria', 'ana-maria', 'añá']) {
      expect(firstError({ username, password: '12345678' })).toMatch(/minúsculas/);
    }
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(firstError({ username: 'ana', password: '1234567' })).toMatch(/al menos 8/);
  });

  it('rejects passwords longer than 128 characters', () => {
    expect(firstError({ username: 'ana', password: 'x'.repeat(129) })).toMatch(/máximo 128/);
  });

  it('explains missing fields and a missing body', () => {
    expect(firstError({ password: '12345678' })).toMatch(/usuario es obligatorio/);
    expect(firstError({ username: 'ana' })).toMatch(/contraseña es obligatoria/);
    expect(firstError(undefined)).toMatch(/Faltan/);
  });
});
