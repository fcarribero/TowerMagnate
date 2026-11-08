import { STAR_POPULATION_THRESHOLDS, type StarRating } from '@tower-magnate/shared';
import type { StringKey } from '../strings';

export interface NextStep {
  titleLabel: StringKey;
  /** The next rank in stars, or null when the next rank is Torre. */
  rank: number | null;
  requirement: StringKey;
  targetPopulation: number;
}

export interface StarsView {
  currentLabel: StringKey;
  /** Null at the top rank. */
  next: NextStep | null;
}

export function starsView(stars: StarRating): StarsView {
  if (stars === 6) {
    return { currentLabel: 'window.stars.currentTower', next: null };
  }
  const targetPopulation = STAR_POPULATION_THRESHOLDS[stars];
  if (stars === 5) {
    return {
      currentLabel: 'window.stars.current',
      next: {
        titleLabel: 'window.stars.nextTower',
        rank: null,
        requirement: 'stars.req.tower',
        targetPopulation,
      },
    };
  }
  const rank = stars + 1;
  return {
    currentLabel: 'window.stars.current',
    next: {
      titleLabel: 'window.stars.next',
      rank,
      requirement: `stars.req.${rank}` as StringKey,
      targetPopulation,
    },
  };
}

/** Share of the target reached, from 0 to 1. */
export function populationProgress(population: number, target: number): number {
  return Math.min(1, Math.max(0, population / target));
}
