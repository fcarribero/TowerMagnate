import argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

let unknownUserHash: Promise<string> | undefined;

// Login for an unknown username still pays for one argon2 check,
// so response time does not reveal which usernames exist.
export async function verifyAgainstUnknownUser(password: string): Promise<false> {
  unknownUserHash ??= hashPassword('unknown-user-placeholder');
  await verifyPassword(await unknownUserHash, password);
  return false;
}
