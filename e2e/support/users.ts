import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

export const REGISTER_PATH = '/api/auth/register';

export interface TestUser {
  username: string;
  password: string;
}

export function uniqueUser(): TestUser {
  const suffix = randomBytes(8).toString('hex');
  return {
    username: `e2e_${suffix}`,
    password: `pw-${randomBytes(8).toString('hex')}`,
  };
}

export async function registerUser(request: APIRequestContext): Promise<TestUser> {
  const user = uniqueUser();
  const response = await request.post(REGISTER_PATH, { data: user });
  if (!response.ok()) {
    throw new Error(`Registering ${user.username} failed with ${response.status()}`);
  }
  return user;
}
