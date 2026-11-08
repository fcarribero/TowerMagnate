import {
  LEASE_CONTRACT_WEEKS,
  SHOP_EARLY_LEAVE_MIN_VISITS,
  WEEKLY_RENT,
  type Lease,
  type TenantEvaluation,
  type TowerState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';
import { DAYS_PER_WEEK } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { creditMoney } from './money';
import type { SimulationSystem, StepContext } from './step';
import { unitNumber } from './units';

export const STEPS_PER_WEEK = STEPS_PER_DAY * DAYS_PER_WEEK;

type LeasedUnitType = keyof typeof WEEKLY_RENT;
type LeasedUnit = Unit & { type: LeasedUnitType };

/** Decides at the end of a term whether the tenant stays. Null means no evaluation yet: renew. */
export type TenantEvaluator = (state: TowerState, unit: Unit) => TenantEvaluation | null;

const NEWS_ON_LEAVING: Readonly<Record<LeasedUnitType, string>> = {
  office: 'news.officeLeft',
  'retail-shop': 'news.shopLeftEvaluation',
};

const NEWS_ON_LEAVING_EARLY = 'news.shopLeftNoCustomers';

export function isLeasable(unit: Unit): unit is LeasedUnit {
  return unit.type in WEEKLY_RENT;
}

function weeklyRent(unit: LeasedUnit): number {
  return WEEKLY_RENT[unit.type][unit.priceLevel];
}

function termEndStep(lease: Lease): number {
  return lease.anchorStep + LEASE_CONTRACT_WEEKS * STEPS_PER_WEEK;
}

/** E-10 and the renewal half of E-12: a new term anchored now, week 1 paid at once. */
function startTerm(context: StepContext, unit: LeasedUnit, event: 'leaseSigned' | 'leaseRenewed') {
  const step = context.state.step;
  unit.lease = { anchorStep: step, nextDueStep: step + STEPS_PER_WEEK, weekVisits: 0 };
  unit.used = true;
  creditMoney(context.state, 'rent', weeklyRent(unit));
  context.events.push({ type: event, step, unitId: unit.id });
}

function endLease(context: StepContext, unit: LeasedUnit, newsKey: string): void {
  const step = context.state.step;
  unit.lease = null;
  context.events.push({ type: 'leaseEnded', step, unitId: unit.id });
  context.events.push({ type: 'news', step, key: newsKey, unitId: unit.id });
}

/**
 * Counts a customer visit that starts now inside a shop, for the early-leave check (economy 4.3).
 * A shop without a tenant and any other unit count nothing.
 */
export function recordShopVisit(unit: Unit): void {
  if (unit.type === 'retail-shop' && unit.lease) unit.lease.weekVisits += 1;
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
  startTerm(context, unit, 'leaseSigned');
}

function settleDueLease(context: StepContext, unit: LeasedUnit, evaluate: TenantEvaluator): void {
  const lease = unit.lease as Lease;
  if (hasTooFewCustomers(unit, lease)) {
    endLease(context, unit, NEWS_ON_LEAVING_EARLY);
    return;
  }
  if (lease.nextDueStep < termEndStep(lease)) {
    creditMoney(context.state, 'rent', weeklyRent(unit));
    lease.nextDueStep += STEPS_PER_WEEK;
    lease.weekVisits = 0;
    return;
  }
  if (evaluate(context.state, unit) === 'poor') {
    endLease(context, unit, NEWS_ON_LEAVING[unit.type]);
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

/** Collects weekly rent and runs the end-of-term evaluation, in order of unit id. */
export function createLeaseSystem(evaluate: TenantEvaluator = () => null): SimulationSystem {
  return (context) => {
    for (const unit of leasesDueAt(context.state, context.state.step)) {
      settleDueLease(context, unit, evaluate);
    }
  };
}
