import { describe, expect, it } from 'vitest';
import { uniqueUser } from './users';

describe('uniqueUser', () => {
  it('follows the username and password rules', () => {
    const user = uniqueUser();
    expect(user.username).toMatch(/^[a-z0-9_]{3,20}$/);
    expect(user.password.length).toBeGreaterThanOrEqual(8);
  });

  it('never repeats a username', () => {
    const usernames = new Set(Array.from({ length: 500 }, () => uniqueUser().username));
    expect(usernames.size).toBe(500);
  });
});
