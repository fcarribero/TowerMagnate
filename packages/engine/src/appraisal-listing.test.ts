import { APPRAISAL_RANGE_PERCENT, priceBand, type UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { appraisalFactors, computeAppraisal, storeDailyAppraisals } from './appraisal';
import { STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { towerCommandHandlers } from './commands';
import { createLeaseSystem, isInLeaseWindow, moveInTenant, STEPS_PER_WEEK } from './leases';
import { countPeopleOfUnit } from './people';
import { createProspectDemand } from './prospects';
import { createScheduler } from './scheduler';
import { createEngine, step } from './step';
import { addFlight, buildTower, plainTowerPlan } from './testing';
import { createTrekSystem } from './trek';
import { venuePeople } from './venue-people';

function towerWith(type: 'office' | 'condo' | 'fast-food' | 'retail-shop', stairs = false) {
  const plan = { ...plainTowerPlan(3, 0, 99), units: [{ type, x: 60, level: 2 }] };
  const { state, unitIds } = buildTower(plan);
  if (stairs) addFlight(state, 'stairs', 20, 1);
  return { state, id: unitIds[0] as UnitId };
}

function command(unitId: string, rest: Record<string, unknown>) {
  return { id: 'c', command: { unitId, ...rest } as never };
}

describe('appraisal', () => {
  it('starts from the base price and moves with the unit grade', () => {
    const { state } = towerWith('office');
    const at = (evaluation: 'good' | 'fair' | 'poor' | null) =>
      computeAppraisal(state, { type: 'office', evaluation });
    expect(at(null)).toBe(10_000);
    expect(at('fair')).toBe(10_000);
    expect(at('good')).toBe(12_000);
    expect(at('poor')).toBe(8_000);
  });

  it('rises with the stars and the amenities, within the range', () => {
    const { state } = towerWith('office');
    state.stars = 4;
    expect(computeAppraisal(state, { type: 'office', evaluation: null })).toBe(11_200);
    state.stars = 6;
    const great = computeAppraisal(state, { type: 'office', evaluation: 'good' });
    expect(great).toBeLessThanOrEqual(10_000 * (APPRAISAL_RANGE_PERCENT.max / 100));
    state.stars = 1;
    expect(computeAppraisal(state, { type: 'office', evaluation: 'poor' })).toBeGreaterThanOrEqual(
      10_000 * (APPRAISAL_RANGE_PERCENT.min / 100),
    );
  });

  it('counts amenity units but caps their effect', () => {
    const { state } = towerWith('office');
    const base = computeAppraisal(state, { type: 'office', evaluation: null });
    const shops = buildTower({
      ...plainTowerPlan(3, 0, 370),
      units: Array.from({ length: 30 }, (_, index) => ({
        type: 'retail-shop' as const,
        x: index * 12,
        level: 2,
      })),
    }).state;
    expect(appraisalFactors(shops).amenities).toBe(30);
    expect(computeAppraisal(shops, { type: 'office', evaluation: null })).toBe(base + 1_200);
  });

  it('is stored every day at 00:00 and leaves the price alone', () => {
    const { state, id } = towerWith('office');
    const unit = state.units[id]!;
    unit.evaluation = 'good';
    storeDailyAppraisals(state);
    expect(unit.appraisal).toBe(12_000);
    expect(unit.price).toBe(10_000);
    expect(priceBand(unit.price, unit.appraisal)).toBe('low');
    expect(priceBand(12_000, 12_000)).toBe('normal');
    expect(priceBand(12_700, 12_000)).toBe('high');
  });
});

describe('lease window', () => {
  it('is open from 07:00 up to 09:00', () => {
    expect(isInLeaseWindow(7 * STEPS_PER_HOUR - 1)).toBe(false);
    expect(isInLeaseWindow(7 * STEPS_PER_HOUR)).toBe(true);
    expect(isInLeaseWindow(9 * STEPS_PER_HOUR - 1)).toBe(true);
    expect(isInLeaseWindow(9 * STEPS_PER_HOUR)).toBe(false);
  });

  it('counts rent from 07:00 whatever the hour the contract started', () => {
    const { state, id } = towerWith('office');
    const engine = createEngine({
      commandHandlers: {},
      systems: [
        (context) => {
          if (context.state.step === 8 * STEPS_PER_HOUR + 40) moveInTenant(context, id);
        },
        createLeaseSystem(),
      ],
    });
    const moved = engine.step(state, [], 8 * STEPS_PER_HOUR + 41).state;
    expect(moved.units[id]?.lease).toMatchObject({
      anchorStep: 7 * STEPS_PER_HOUR,
      nextDueStep: 7 * STEPS_PER_HOUR + STEPS_PER_WEEK,
    });
    expect(moved.money - state.money).toBe(10_000);
  });
});

describe('listing', () => {
  const demand = createProspectDemand();
  const prospectEngine = createEngine({
    commandHandlers: towerCommandHandlers,
    systems: [createScheduler(demand.rollHooks), createTrekSystem(), demand.system],
  });

  it('keeps unlisted units off the market until the player lists them', () => {
    for (const type of ['office', 'condo'] as const) {
      const { state, id } = towerWith(type, true);
      state.units[id]!.listed = false;
      let after = prospectEngine.step(state, [], 2 * STEPS_PER_DAY).state;
      expect(after.units[id]?.lease ?? after.units[id]?.sale).toBeNull();
      const listed = step(after, [command(id, { type: 'setListed', listed: true })], 0);
      expect(listed.results[0]).toMatchObject({ ok: true });
      expect(listed.state.units[id]?.listed).toBe(true);
      after = prospectEngine.step(listed.state, [], 6 * STEPS_PER_DAY).state;
      expect(after.units[id]?.lease ?? after.units[id]?.sale).not.toBeNull();
    }
  });

  it('refuses a sold condo and a unit that is not for rent or sale', () => {
    const { state, id } = towerWith('condo');
    state.units[id]!.sale = { price: 1, anchorStep: 0, nextEvaluationStep: STEPS_PER_WEEK };
    const sold = step(state, [command(id, { type: 'setListed', listed: false })], 0);
    expect(sold.results[0]).toMatchObject({ ok: false, error: 'PRICE_LOCKED' });
    const food = towerWith('fast-food');
    const other = step(food.state, [command(food.id, { type: 'setListed', listed: true })], 0);
    expect(other.results[0]).toMatchObject({ ok: false, error: 'NOT_PRICED' });
  });

  it('lists a construction site so the finished unit starts listed', () => {
    const { state } = towerWith('office');
    state.sites.u50 = { id: 'u50', type: 'office', x: 0, level: 2, paid: 0, placedAtStep: 0, points: 0 };
    const result = step(state, [command('u50', { type: 'setListed', listed: true })], 0);
    expect(result.state.sites.u50?.listed).toBe(true);
  });

  it('ends the lease of an unlisted office at the end of the week, with no news', () => {
    const { state, id } = towerWith('office');
    const engine = createEngine({
      commandHandlers: towerCommandHandlers,
      systems: [
        (context) => {
          if (context.state.step === 10) moveInTenant(context, id);
        },
        createLeaseSystem(() => 'good'),
      ],
    });
    const moved = engine.step(state, [], 11).state;
    const unlisted = engine.step(moved, [command(id, { type: 'setListed', listed: false })], 0).state;
    const run = engine.step(unlisted, [], STEPS_PER_WEEK - 1);
    expect(run.state.units[id]?.lease).toBeNull();
    const types = run.events.map((event) => event.type);
    expect(types).toContain('leaseEnded');
    expect(types).not.toContain('news');
    const relisted = engine.step(
      moved,
      [command(id, { type: 'setListed', listed: true })],
      STEPS_PER_WEEK - 1,
    );
    expect(relisted.state.units[id]?.lease).not.toBeNull();
  });
});

describe('fast food hours and switch', () => {
  it('sets whole hours with close after open and refuses the rest', () => {
    const { state, id } = towerWith('fast-food');
    const send = (open: number, close: number) =>
      step(state, [command(id, { type: 'setVenueHours', open, close })], 0);
    const ok = send(9, 18);
    expect(ok.results[0]).toMatchObject({ ok: true });
    expect(ok.state.units[id]?.hours).toEqual({ open: 9, close: 18 });
    expect(state.units[id]?.hours).toEqual({ open: 8, close: 20 });
    for (const [open, close] of [
      [10, 10],
      [12, 9],
      [-1, 5],
      [0, 25],
      [8.5, 20],
    ] as const) {
      expect(send(open, close).results[0]).toMatchObject({ ok: false, error: 'INVALID_COMMAND' });
    }
    const office = towerWith('office');
    const wrong = step(
      office.state,
      [command(office.id, { type: 'setVenueHours', open: 9, close: 18 })],
      0,
    );
    expect(wrong.results[0]).toMatchObject({ ok: false });
  });

  it('switches off from the next 00:00 and removes the crew', () => {
    const { state, id } = towerWith('fast-food');
    const first = step(state, [], STEPS_PER_DAY).state;
    expect(countPeopleOfUnit(first.people, id)).toBeGreaterThan(0);
    const off = step(first, [command(id, { type: 'setVenueEnabled', enabled: false })], 0);
    expect(off.state.units[id]?.enabled).toBe(false);
    expect(off.state.units[id]?.activeToday).toBe(true);
    const next = step(off.state, [], STEPS_PER_DAY).state;
    expect(next.units[id]?.activeToday).toBe(false);
    expect(countPeopleOfUnit(next.people, id)).toBe(0);
    expect(next.units[id]?.venue?.customers).toEqual([]);
    const back = step(next, [command(id, { type: 'setVenueEnabled', enabled: true })], 0);
    expect(back.state.units[id]?.activeToday).toBe(false);
    const again = step(back.state, [], STEPS_PER_DAY).state;
    expect(again.units[id]?.activeToday).toBe(true);
    expect(countPeopleOfUnit(again.people, id)).toBeGreaterThan(0);
  });

  it('lists the crew of a fast food and nobody inside before it opens', () => {
    const { state, id } = towerWith('fast-food');
    const day = step(state, [], STEPS_PER_DAY).state;
    const people = venuePeople(day, day.units[id]!);
    expect(people.workers.length).toBe(4);
    expect(people.customers).toEqual([]);
  });
});
