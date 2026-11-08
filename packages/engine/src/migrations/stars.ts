import { StarRatingSchema, type StarRating } from '@tower-magnate/shared';
import { StateMigrationError } from './errors';

export function readStars(raw: unknown): StarRating {
  const parsed = StarRatingSchema.safeParse(raw);
  if (!parsed.success) {
    throw new StateMigrationError('State stars must be a whole number from 1 to 6');
  }
  return parsed.data;
}
