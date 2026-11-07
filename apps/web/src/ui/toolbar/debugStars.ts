import type { StarRating } from '@tower-magnate/shared';

/** Reads `?stars=N` (1 to 6) so the toolbar can be checked at any rating in a dev build. */
export function debugStarsFromQuery(search: string): StarRating | null {
  const value = Number(new URLSearchParams(search).get('stars'));
  return Number.isInteger(value) && value >= 1 && value <= 6 ? (value as StarRating) : null;
}
