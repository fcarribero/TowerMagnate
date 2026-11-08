import { vi } from 'vitest';

// Tests only need valid argon2id hashes. The production cost makes every auth test take
// seconds when the machine is busy, so hash with the smallest allowed cost here.
vi.mock('argon2', async (importOriginal) => {
  const original = await importOriginal<typeof import('argon2')>();
  const cheap = { memoryCost: 8, timeCost: 2, parallelism: 1 };
  const hash = (password: string, options?: object) =>
    original.hash(password, { ...options, ...cheap });
  return { ...original, hash, default: { ...original, hash } };
});
