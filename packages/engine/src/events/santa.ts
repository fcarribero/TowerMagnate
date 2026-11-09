import { SANTA_TIME } from '@tower-magnate/shared';
import { dateOfStep, STEPS_PER_HOUR, STEPS_PER_MINUTE } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import type { StepContext } from '../step';
import { emitNews } from '../news';

const SANTA_STEP_OF_DAY = SANTA_TIME.hour * STEPS_PER_HOUR + SANTA_TIME.minute * STEPS_PER_MINUTE;

export function isSantaStep(step: number): boolean {
  if (step % STEPS_PER_DAY !== SANTA_STEP_OF_DAY) return false;
  const { month, day } = dateOfStep(step);
  return month === SANTA_TIME.month && day === SANTA_TIME.day;
}

/** Events spec section 8: a cosmetic notice for the client, with no draw and no other effect. */
export function runSanta(context: StepContext): void {
  const { step } = context.state;
  if (!isSantaStep(step)) return;
  context.events.push(...emitNews(context.state, 'news.santa'));
}
