import {
  LEASE_RENT_HOUR,
  LEASE_WINDOW_HOURS,
  SHOP_EARLY_LEAVE_MIN_VISITS,
  WEEKLY_RENT,
  type Lease,
  type TenantEvaluation,
  type TowerState,
  type Unit,
  type UnitId,
  type NewsId,
} from '@tower-magnate/shared';
import { DAYS_PER_WEEK, dateOfStep, STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { creditMoney, pushUnitMoney } from './money';
import { removePeopleOfUnit } from './people';
import { addCrew } from './venue-staff';
import type { SimulationSystem, StepContext } from './step';
import { writableUnit } from './step-copy';
import { unitNumber } from './units';
import { clearUnitLedger, storeGrade } from './unit-evaluation';
import { emitNews } from './news';

export const STEPS_PER_WEEK = STEPS_PER_DAY * DAYS_PER_WEEK;

type LeasedUnitType = keyof typeof WEEKLY_RENT;
type LeasedUnit = Unit & { type: LeasedUnitType };

/** Decides at the end of each week whether the tenant stays. Null means no evaluation yet: renew. */
export type TenantEvaluator = (state: TowerState, unit: Unit) => TenantEvaluation | null;

const NEWS_ON_LEAVING: Readonly<Record<LeasedUnitType, NewsId>> = {
  office: 'news.officeLeft',
  'retail-shop': 'news.shopLeftEvaluation',
};

const NEWS_ON_LEAVING_EARLY = 'news.shopLeftNoCustomers';

export function isLeasable(unit: Unit): unit is LeasedUnit {
  return unit.type in WEEKLY_RENT;
}

/** New contracts only start from 07:00 up to 09:00. */
export function isInLeaseWindow(step: number): boolean {
  const { hour } = dateOfStep(step);
  return hour >= LEASE_WINDOW_HOURS.from && hour < LEASE_WINDOW_HOURS.until;
}

/**
 * The step weekly rent is counted from: 07:00 of the day the term starts, so rent is always
 * charged at 07:00 on the start weekday. A start before 07:00 (old saves only) counts from itself.
 */
function rentAnchorStep(step: number): number {
  const dayStart = step - (step % STEPS_PER_DAY);
  return Math.min(step, dayStart + LEASE_RENT_HOUR * STEPS_PER_HOUR);
}

/** E-10 and the renewal half of E-12: a new one-week term anchored now, its rent paid at once. */
function startTerm(context: StepContext, unit: LeasedUnit, event: 'leaseSigned' | 'leaseRenewed') {
  const step = context.state.step;
  const anchorStep = rentAnchorStep(step);
  unit.lease = {
    anchorStep,
    nextDueStep: anchorStep + STEPS_PER_WEEK,
    weekVisits: 0,
    rent: unit.price,
  };
  unit.used = true;
  const rent = creditMoney(context.state, 'rent', unit.price);
  pushUnitMoney(context, unit.id, rent, 'rent');
  addCrew(context.state, unit.id);
  context.events.push({ type: event, step, unitId: unit.id });
}

function endLease(context: StepContext, unit: LeasedUnit, newsKey: NewsId | null): void {
  const step = context.state.step;
  unit.lease = null;
  unit.evaluation = null;
  // The tenant's people leave with them, so the empty unit has no workers walking in and out.
  removePeopleOfUnit(context.state, unit.id);
  context.events.push({ type: 'leaseEnded', step, unitId: unit.id });
  if (newsKey !== null) context.events.push(...emitNews(context.state, newsKey, { unitId: unit.id }));
}

/**
 * Counts a customer visit that starts now inside a shop, for the early-leave check (economy 4.3).
 * A shop without a tenant and any other unit count nothing.
 */
export function recordShopVisit(state: TowerState, unit: Unit): void {
  if (unit.type !== 'retail-shop' || !unit.lease) return;
  const lease = writableUnit(state, unit).lease as Lease;
  lease.weekVisits += 1;
}

/** E-15: at every due step after move-in, a shop with too few customers that week leaves. */
function hasTooFewCustomers(unit: LeasedUnit, lease: Lease): boolean {
  return unit.type === 'retail-shop' && lease.weekVisits < SHOP_EARLY_LEAVE_MIN_VISITS;
}

/** Starts a lease at the current step. Called by tenant demand when a tenant moves in. */
export function moveInTenant(context: StepContext, unitId: UnitId): void {
  const unit = context.state.units[unitId];
  if (!unit || !isLeasable(unit)) {
    throw new Error(`Unit ${unitId} is not an office or shop`);
  }
  if (unit.lease) {
    throw new Error(`Unit ${unitId} already has a tenant`);
  }
  clearUnitLedger(context.state, unitId);
  startTerm(context, writableUnit(context.state, unit), 'leaseSigned');
}

function settleDueLease(context: StepContext, unit: LeasedUnit, evaluate: TenantEvaluator): void {
  const lease = unit.lease as Lease;
  if (hasTooFewCustomers(unit, lease)) {
    endLease(context, unit, NEWS_ON_LEAVING_EARLY);
    return;
  }
  storeGrade(context.state, unit);
  if (evaluate(context.state, unit) === 'poor') {
    endLease(context, unit, NEWS_ON_LEAVING[unit.type]);
  } else if (!unit.listed) {
    // The player took the unit off the market: the week runs out and the tenant leaves.
    endLease(context, unit, null);
  } else {
    startTerm(context, unit, 'leaseRenewed');
  }
}

function leasesDueAt(state: TowerState, step: number): LeasedUnit[] {
  const due: LeasedUnit[] = [];
  for (const unit of Object.values(state.units)) {
    if (unit.lease?.nextDueStep === step && isLeasable(unit)) {
      due.push(unit);
    }
  }
  return due.sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/** Runs the weekly renewal or leave decision and collects the rent, in order of unit id. */
export function createLeaseSystem(evaluate: TenantEvaluator = () => null): SimulationSystem {
  return (context) => {
    for (const unit of leasesDueAt(context.state, context.state.step)) {
      settleDueLease(context, writableUnit(context.state, unit), evaluate);
    }
  };
}
