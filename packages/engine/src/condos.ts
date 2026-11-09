import {
  CONDO_EVALUATION_WEEKS,
  CONDO_SALE_PRICE,
  type CondoSale,
  type UnitId,
  type Unit,
} from '@tower-magnate/shared';
import { chargeMoney, creditMoney } from './money';
import { STEPS_PER_WEEK } from './leases';
import type { SimulationSystem, StepContext } from './step';
import { writableUnit } from './step-copy';
import type { TenantEvaluator } from './leases';
import { unitNumber } from './units';
import { clearUnitLedger, storeGrade } from './unit-evaluation';
import { emitNews } from './news';

const EVALUATION_INTERVAL_STEPS = CONDO_EVALUATION_WEEKS * STEPS_PER_WEEK;

type Condo = Unit & { type: 'condo' };

function isCondo(unit: Unit): unit is Condo {
  return unit.type === 'condo';
}

/** E-24: the buyer pays the price at the level in force now; the sale price is locked in. */
export function sellCondo(context: StepContext, unitId: UnitId): void {
  const shared = context.state.units[unitId];
  if (!shared || !isCondo(shared)) {
    throw new Error(`Unit ${unitId} is not a condo`);
  }
  if (shared.sale) {
    throw new Error(`Condo ${unitId} already has owners`);
  }
  const unit = writableUnit(context.state, shared);
  const step = context.state.step;
  const price = CONDO_SALE_PRICE[unit.priceLevel];
  clearUnitLedger(context.state, unitId);
  creditMoney(context.state, 'condoSales', price);
  const sale: CondoSale = {
    price,
    anchorStep: step,
    nextEvaluationStep: step + EVALUATION_INTERVAL_STEPS,
  };
  unit.sale = sale;
  unit.used = true;
  context.events.push({ type: 'condoSold', step, unitId });
}

/** E-26: the owners leave and get the recorded price back, even into a negative balance. */
function buyBackCondo(context: StepContext, unit: Condo, sale: CondoSale): void {
  const step = context.state.step;
  chargeMoney(context.state, 'condoBuybacks', sale.price);
  unit.sale = null;
  unit.evaluation = null;
  context.events.push({ type: 'condoVacated', step, unitId: unit.id });
  context.events.push(...emitNews(context.state, 'news.condoBuyback', { unitId: unit.id }));
}

function evaluateOwners(context: StepContext, unit: Condo, evaluate: TenantEvaluator): void {
  const sale = unit.sale as CondoSale;
  storeGrade(context.state, unit);
  if (evaluate(context.state, unit) === 'poor') {
    buyBackCondo(context, unit, sale);
  } else {
    sale.nextEvaluationStep += EVALUATION_INTERVAL_STEPS;
  }
}

function condosDueAt(context: StepContext): Condo[] {
  const due: Condo[] = [];
  for (const unit of Object.values(context.state.units)) {
    if (isCondo(unit) && unit.sale?.nextEvaluationStep === context.state.step) {
      due.push(unit);
    }
  }
  return due.sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/** Evaluates condo owners every 4 weeks after the sale, in order of unit id. */
export function createCondoSystem(evaluate: TenantEvaluator = () => null): SimulationSystem {
  return (context) => {
    for (const unit of condosDueAt(context)) {
      evaluateOwners(context, writableUnit(context.state, unit), evaluate);
    }
  };
}
