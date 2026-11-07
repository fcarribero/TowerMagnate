import { z } from 'zod';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const PASSWORD_MIN_LENGTH = 8;
// argon2 accepts long inputs, but hashing megabytes per request is an easy way to burn CPU.
export const PASSWORD_MAX_LENGTH = 128;

export const usernameSchema = z
  .string({ error: 'El nombre de usuario es obligatorio.' })
  .min(USERNAME_MIN_LENGTH, {
    error: `El nombre de usuario debe tener al menos ${USERNAME_MIN_LENGTH} caracteres.`,
  })
  .max(USERNAME_MAX_LENGTH, {
    error: `El nombre de usuario debe tener como máximo ${USERNAME_MAX_LENGTH} caracteres.`,
  })
  .regex(/^[a-z0-9_]+$/, {
    error: 'El nombre de usuario solo puede tener letras minúsculas, números y guiones bajos.',
  });

export const passwordSchema = z
  .string({ error: 'La contraseña es obligatoria.' })
  .min(PASSWORD_MIN_LENGTH, {
    error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `La contraseña debe tener como máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
  });

export const credentialsSchema = z.object(
  { username: usernameSchema, password: passwordSchema },
  { error: 'Faltan el nombre de usuario y la contraseña.' },
);

export type Credentials = z.infer<typeof credentialsSchema>;

export interface AuthUser {
  id: number;
  username: string;
}

export interface AuthErrorBody {
  error: string;
}
