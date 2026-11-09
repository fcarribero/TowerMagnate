import { describe, expect, it } from 'vitest';
import { stepOfDate } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { createTower } from '../state';
import { step } from '../step';
import { isSantaStep } from './santa';

const STEPS_PER_HOUR = 360;

function santaStep(year: number): number {
  return stepOfDate({ year, month: 12, day: 24, hour: 22 });
}

/** A tower whose next step is `target`, so a one-step run lands on it. */
function towerJustBefore(target: number) {
  return { ...createTower(9), step: target - 1 };
}

describe('Papá Noel', () => {
  it('is due only at 22:00 on 24 December', () => {
    expect(isSantaStep(santaStep(1))).toBe(true);
    expect(isSantaStep(santaStep(4))).toBe(true);
    expect(isSantaStep(santaStep(1) - 1)).toBe(false);
    expect(isSantaStep(santaStep(1) + 1)).toBe(false);
    expect(isSantaStep(santaStep(1) - STEPS_PER_DAY)).toBe(false);
    expect(isSantaStep(santaStep(1) + STEPS_PER_DAY)).toBe(false);
    expect(isSantaStep(stepOfDate({ year: 1, month: 11, day: 24, hour: 22 }))).toBe(false);
  });

  it('emits news.santa once over 24 and 25 December of year 1', () => {
    const christmasEve = stepOfDate({ year: 1, month: 12, day: 24 });
    const { events } = step({ ...createTower(9), step: christmasEve }, [], 2 * STEPS_PER_DAY);
    const santa = events.filter((event) => event.type === 'news' && event.key === 'news.santa');
    expect(santa).toEqual([
      { type: 'news', step: santaStep(1), key: 'news.santa', unitId: null, params: {} },
    ]);
  });

  it('comes back the next year', () => {
    const { events } = step(towerJustBefore(santaStep(2)), [], 1);
    expect(events).toContainEqual({
      type: 'news',
      step: santaStep(2),
      key: 'news.santa',
      unitId: null,
      params: {},
    });
  });

  it('changes nothing in the tower besides the notice', () => {
    const before = towerJustBefore(santaStep(1));
    const quiet = towerJustBefore(santaStep(1) - STEPS_PER_HOUR);

    const withSanta = step(before, [], 1).state;
    const withoutSanta = step(quiet, [], 1).state;

    expect(withSanta.notices.map((notice) => notice.key)).toEqual(['news.santa']);
    expect({ ...withSanta, step: 0, notices: [], newsSent: {} }).toEqual({
      ...withoutSanta,
      step: 0,
      notices: [],
      newsSent: {},
    });
  });
});
