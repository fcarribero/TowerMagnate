import { z } from 'zod';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const PASSWORD_MIN_LENGTH = 8;
// argon2 accepts long inputs, but hashing megabytes per request is an easy way to burn CPU.
export const PASSWORD_MAX_LENGTH = 128;

// Same wording as the auth.* texts of the web client (ui.md 13.12).
const REQUIRED_MESSAGE = 'Completá este campo.';
const USERNAME_INVALID_MESSAGE = `El usuario lleva de ${USERNAME_MIN_LENGTH} a ${USERNAME_MAX_LENGTH} caracteres: letras minúsculas, números o _.`;

export const usernameSchema = z
  .string({ error: REQUIRED_MESSAGE })
  .min(USERNAME_MIN_LENGTH, {
    error: USERNAME_INVALID_MESSAGE,
  })
  .max(USERNAME_MAX_LENGTH, {
    error: USERNAME_INVALID_MESSAGE,
  })
  .regex(/^[a-z0-9_]+$/, {
    error: USERNAME_INVALID_MESSAGE,
  });

export const passwordSchema = z
  .string({ error: REQUIRED_MESSAGE })
  .min(PASSWORD_MIN_LENGTH, {
    error: `La contraseña lleva al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `La contraseña lleva como máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
  });

export const credentialsSchema = z.object(
  { username: usernameSchema, password: passwordSchema },
  { error: REQUIRED_MESSAGE },
);

export type Credentials = z.infer<typeof credentialsSchema>;

export interface AuthUser {
  id: number;
  username: string;
  /** True for the accounts that get the developer menu. Only set by the auth routes. */
  developer?: boolean;
}

export interface AuthErrorBody {
  error: string;
}
