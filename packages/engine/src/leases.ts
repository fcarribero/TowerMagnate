import {
  LEASE_CONTRACT_WEEKS,
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
  unit.lease = { anchorStep: step, nextDueStep: step + STEPS_PER_WEEK };
  unit.used = true;
  creditMoney(context.state, 'rent', weeklyRent(unit));
  context.events.push({ type: event, step, unitId: unit.id });
}

function endLease(context: StepContext, unit: LeasedUnit): void {
  const step = context.state.step;
  unit.lease = null;
  context.events.push({ type: 'leaseEnded', step, unitId: unit.id });
  context.events.push({ type: 'news', step, key: NEWS_ON_LEAVING[unit.type], unitId: unit.id });
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
  if (lease.nextDueStep < termEndStep(lease)) {
    creditMoney(context.state, 'rent', weeklyRent(unit));
    lease.nextDueStep += STEPS_PER_WEEK;
    return;
  }
  if (evaluate(context.state, unit) === 'poor') {
    endLease(context, unit);
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
