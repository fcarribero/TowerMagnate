import { stressScore, type TowerState, type UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { computeAppraisal, storeDailyAppraisals } from './appraisal';
import { buildTower, plainTowerPlan } from './testing';
import { fileUnitTrip } from './unit-evaluation';
import { occupantPercent, occupantScore, towerScore } from './unit-value';

function officeTower(withFastFood = false): { state: TowerState; office: UnitId } {
  const units: { type: 'office' | 'fast-food'; x: number; level: number }[] = [
    { type: 'office', x: 60, level: 2 },
  ];
  if (withFastFood) units.push({ type: 'fast-food', x: 72, level: 2 });
  const { state, unitIds } = buildTower({ ...plainTowerPlan(3, 0, 120), units });
  state.step = 100_000;
  return { state, office: unitIds[0] as UnitId };
}

function fileTrips(state: TowerState, office: UnitId, stress: number): void {
  const unit = state.units[office]!;
  for (let trip = 0; trip < 4; trip++) fileUnitTrip(state, unit, state.step - 10 - trip, stress);
}

describe('occupant percent', () => {
  it('is +30 at a score of 0, 0 at 3 and -50 at 10, in straight lines', () => {
    expect(occupantPercent(0)).toBe(30);
    expect(occupantPercent(1.5)).toBeCloseTo(15, 5);
    expect(occupantPercent(3)).toBe(0);
    expect(occupantPercent(6.5)).toBeCloseTo(-25, 5);
    expect(occupantPercent(10)).toBe(-50);
  });
});

describe('tower score', () => {
  it('is 3 with no trips filed and the score of the average trip otherwise', () => {
    const { state } = officeTower();
    expect(towerScore(state)).toBe(3);
    state.tripLedger = { '1': [10, 100, 20, 260] };
    expect(towerScore(state)).toBeCloseTo(stressScore(180), 9);
  });
});

describe('occupant score', () => {
  it('is the score of the unit base when the unit has trips in its window', () => {
    const { state, office } = officeTower();
    fileTrips(state, office, 90);
    expect(occupantScore(state, state.units[office]!)).toBeCloseTo(stressScore(90), 9);
  });

  it('falls back to the tower score with no trips in the window', () => {
    const { state, office } = officeTower();
    state.tripLedger = { '1': [10, 180] };
    expect(occupantScore(state, state.units[office]!)).toBeCloseTo(stressScore(180), 9);
  });

  it('adds 1 for a noise source close by, never past 10', () => {
    const quiet = officeTower();
    const noisy = officeTower(true);
    fileTrips(quiet.state, quiet.office, 90);
    fileTrips(noisy.state, noisy.office, 90);
    expect(occupantScore(noisy.state, noisy.state.units[noisy.office]!)).toBeCloseTo(
      occupantScore(quiet.state, quiet.state.units[quiet.office]!) + 1,
      9,
    );
    fileTrips(noisy.state, noisy.office, 1e9);
    expect(occupantScore(noisy.state, noisy.state.units[noisy.office]!)).toBeLessThanOrEqual(10);
  });
});

describe('fair price', () => {
  it('is 30% over the base price when the occupants feel no stress', () => {
    const { state, office } = officeTower();
    fileTrips(state, office, 0);
    expect(computeAppraisal(state, state.units[office]!)).toBe(13_000);
  });

  it('falls with the occupants score, down to 60% of the base price', () => {
    const { state, office } = officeTower();
    fileTrips(state, office, 180);
    const percent = 100 + occupantPercent(stressScore(180));
    expect(computeAppraisal(state, state.units[office]!)).toBe(Math.round(100 * percent));
    fileTrips(state, office, 540);
    expect(computeAppraisal(state, state.units[office]!)).toBe(6_000);
  });

  it('is the base price for a unit with no trips in a tower with none', () => {
    const { state, office } = officeTower();
    expect(computeAppraisal(state, state.units[office]!)).toBe(10_000);
  });

  it('does not depend on the grade', () => {
    const { state, office } = officeTower();
    const unit = state.units[office]!;
    unit.evaluation = 'good';
    const good = computeAppraisal(state, unit);
    unit.evaluation = 'poor';
    expect(computeAppraisal(state, unit)).toBe(good);
  });

  it('changes nothing when stored twice in a row', () => {
    const { state, office } = officeTower();
    fileTrips(state, office, 120);
    storeDailyAppraisals(state);
    const first = state.units[office]!.appraisal;
    storeDailyAppraisals(state);
    expect(state.units[office]!.appraisal).toBe(first);
  });
});
