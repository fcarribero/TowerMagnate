import { StarRatingSchema, type StarRating, type WeddingAttempt } from '@tower-magnate/shared';
import { isRecord, StateMigrationError } from './errors';

export function readStars(raw: unknown): StarRating {
  const parsed = StarRatingSchema.safeParse(raw);
  if (!parsed.success) {
    throw new StateMigrationError('State stars must be a whole number from 1 to 6');
  }
  return parsed.data;
}

const WEDDING_OUTCOMES: readonly unknown[] = ['pending', 'completed', 'failed'];

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

export function readWedding(raw: unknown): WeddingAttempt | null {
  if (raw === null) return null;
  const valid =
    isRecord(raw) &&
    isNonNegativeInteger(raw.day) &&
    typeof raw.cathedral === 'string' &&
    Array.isArray(raw.arrivals) &&
    raw.arrivals.every(isNonNegativeInteger) &&
    isNonNegativeInteger(raw.inside) &&
    WEDDING_OUTCOMES.includes(raw.outcome);
  if (!valid) {
    throw new StateMigrationError('State wedding must be null or a wedding attempt');
  }
  return {
    day: raw.day as number,
    cathedral: raw.cathedral as string,
    arrivals: [...(raw.arrivals as number[])],
    inside: raw.inside as number,
    outcome: raw.outcome as WeddingAttempt['outcome'],
  };
}
