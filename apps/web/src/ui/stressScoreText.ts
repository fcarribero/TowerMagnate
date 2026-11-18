import { t } from './strings';

/** A 0 to 10 stress score as the player reads it: one decimal, a comma, "/ 10" ("3,4 / 10"). */
export function stressScoreText(score: number): string {
  return t('window.stressScore', { n: score.toFixed(1).replace('.', ',') });
}
