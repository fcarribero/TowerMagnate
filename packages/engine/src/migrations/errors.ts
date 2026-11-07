export class StateMigrationError extends Error {
  override name = 'StateMigrationError';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
