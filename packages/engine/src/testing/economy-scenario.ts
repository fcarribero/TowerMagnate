import {
  LEDGER_CATEGORIES,
  type CategoryTotals,
  type Command,
  type CommandResult,
  type EngineEvent,
  type Ledger,
  type LedgerCategory,
  type QueuedCommand,
  type TowerState,
  type UnitId,
} from '@tower-magnate/shared';
import { WEEKDAYS, weekdayOfDay } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { towerCommandHandlers } from '../commands';
import { createCondoSystem, sellCondo } from '../condos';
import { checkIn, createHotelSystem } from '../hotel';
import { createLeaseSystem, moveInTenant, STEPS_PER_WEEK } from '../leases';
import { ledgerWeekRollHook } from '../money';
import { createScheduler, type ScheduledHook } from '../scheduler';
import { createEngine, type Engine, type SimulationSystem, type StepContext } from '../step';
import { weeklyUpkeepHook } from '../upkeep';
import { recordVenueVisit, venuePayoutHooks } from '../venues';

/** What tenant demand, buyers, guests and customers would do, played without people. */
export type EconomyAction =
  | { kind: 'moveIn'; unitId: UnitId }
  | { kind: 'sellCondo'; unitId: UnitId }
  | { kind: 'checkIn'; unitId: UnitId }
  | { kind: 'visits'; unitId: UnitId; count: number };

export interface TimedEconomyAction {
  step: number;
  action: EconomyAction;
}

export interface DayCommand {
  /** Whole days after step 0; the command goes in at 00:00 of that day. */
  day: number;
  command: Command;
}

export interface EconomyScript {
  actions: readonly TimedEconomyAction[];
  commands: readonly DayCommand[];
}

/** Net change per ledger category; categories that did not move are left out. */
export type CategoryChanges = Partial<Record<LedgerCategory, number>>;

export interface ExpectedDay {
  balance: number;
  changes: CategoryChanges;
}

export interface EconomyDay extends ExpectedDay {
  day: number;
  firstStep: number;
  lastStep: number;
}

export interface EconomyRun {
  days: EconomyDay[];
  state: TowerState;
  results: CommandResult[];
  events: EngineEvent[];
}

const HOUSEKEEPING_HOUR = 11;

/** Cleans every dirty room at 11:00, the job housekeeping staff do in the full game. */
const scriptedHousekeeping: ScheduledHook = {
  name: 'scripted-housekeeping',
  schedule: { every: 'day', hour: HOUSEKEEPING_HOUR, minute: 0 },
  run(context) {
    for (const unit of Object.values(context.state.units)) {
      if (unit.hotel?.state === 'dirty') {
        unit.hotel.state = 'clean';
      }
    }
  },
};

function perform(context: StepContext, action: EconomyAction): void {
  switch (action.kind) {
    case 'moveIn':
      moveInTenant(context, action.unitId);
      return;
    case 'sellCondo':
      sellCondo(context, action.unitId);
      return;
    case 'checkIn':
      checkIn(context, action.unitId);
      return;
    case 'visits':
      for (let visit = 0; visit < action.count; visit++) {
        recordVenueVisit(context.state, action.unitId);
      }
      return;
  }
}

function scriptedActions(actions: readonly TimedEconomyAction[]): SimulationSystem {
  const actionsByStep = new Map<number, EconomyAction[]>();
  for (const { step, action } of actions) {
    const due = actionsByStep.get(step) ?? [];
    due.push(action);
    actionsByStep.set(step, due);
  }
  return (context) => {
    for (const action of actionsByStep.get(context.state.step) ?? []) {
      perform(context, action);
    }
  };
}

/** The money systems of the tower engine, in the same order, plus the scripted actions. */
export function createEconomyEngine(actions: readonly TimedEconomyAction[]): Engine {
  return createEngine({
    commandHandlers: towerCommandHandlers,
    systems: [
      createScheduler([
        ledgerWeekRollHook,
        weeklyUpkeepHook,
        ...venuePayoutHooks,
        scriptedHousekeeping,
      ]),
      createLeaseSystem(),
      createHotelSystem(),
      createCondoSystem(),
      scriptedActions(actions),
    ],
  });
}

function net(totals: CategoryTotals): number {
  return totals.income + totals.expense;
}

/** What each category moved between two ledgers, counting a week roll in between. */
export function ledgerChanges(before: Ledger, after: Ledger, weekRolled: boolean): CategoryChanges {
  const changes: CategoryChanges = {};
  for (const category of LEDGER_CATEGORIES) {
    const startOfSpan = net(before.currentWeek[category]);
    const endOfSpan = net(after.currentWeek[category]);
    const change = weekRolled
      ? net(after.previousWeek[category]) - startOfSpan + endOfSpan
      : endOfSpan - startOfSpan;
    if (change !== 0) {
      changes[category] = change;
    }
  }
  return changes;
}

function weekRolledBetween(fromStep: number, toStep: number): boolean {
  return Math.floor(toStep / STEPS_PER_WEEK) > Math.floor(fromStep / STEPS_PER_WEEK);
}

function commandsForDay(script: EconomyScript, day: number): QueuedCommand[] {
  return script.commands
    .filter((entry) => entry.day === day)
    .map((entry, index) => ({ id: `day${day}-${index + 1}`, command: entry.command }));
}

/**
 * Runs the tower day by day. Each day's commands go in first, then 8,640 steps run, so a day's
 * record ends with the first step of the next day, where Monday's week roll and upkeep fall.
 */
export function runEconomyScenario(
  tower: TowerState,
  script: EconomyScript,
  dayCount: number,
): EconomyRun {
  const engine = createEconomyEngine(script.actions);
  const days: EconomyDay[] = [];
  const results: CommandResult[] = [];
  const events: EngineEvent[] = [];
  let state = tower;
  for (let day = 0; day < dayCount; day++) {
    const outcome = engine.step(state, commandsForDay(script, day), STEPS_PER_DAY);
    days.push({
      day,
      firstStep: state.step + 1,
      lastStep: outcome.state.step,
      balance: outcome.state.money,
      changes: ledgerChanges(
        state.ledger,
        outcome.state.ledger,
        weekRolledBetween(state.step, outcome.state.step),
      ),
    });
    results.push(...outcome.results);
    events.push(...outcome.events);
    state = outcome.state;
  }
  return { days, state, results, events };
}

const WEEKDAY_NAMES = Object.keys(WEEKDAYS);

function dayLabel(day: EconomyDay): string {
  const weekday = WEEKDAY_NAMES[weekdayOfDay(day.day)];
  return `day ${day.day} (${weekday}, steps ${day.firstStep} to ${day.lastStep})`;
}

function differs(actual: EconomyDay, expected: ExpectedDay): boolean {
  if (actual.balance !== expected.balance) {
    return true;
  }
  return LEDGER_CATEGORIES.some(
    (category) => (actual.changes[category] ?? 0) !== (expected.changes[category] ?? 0),
  );
}

function diffLine(name: string, expected: number, actual: number): string {
  const marker = expected === actual ? '' : '   <- differs';
  return `  ${name.padEnd(14)} expected ${expected}, got ${actual}${marker}`;
}

function describeDiff(actual: EconomyDay, expected: ExpectedDay): string {
  const lines = [`Ledger differs on ${dayLabel(actual)}`];
  for (const category of LEDGER_CATEGORIES) {
    const want = expected.changes[category] ?? 0;
    const got = actual.changes[category] ?? 0;
    if (want !== 0 || got !== 0) {
      lines.push(diffLine(category, want, got));
    }
  }
  lines.push(diffLine('balance', expected.balance, actual.balance));
  return lines.join('\n');
}

/** The per-category diff of the first day that does not match, or null when every day does. */
export function firstLedgerMismatch(
  actual: readonly EconomyDay[],
  expected: readonly ExpectedDay[],
): string | null {
  if (actual.length !== expected.length) {
    return `Expected ${expected.length} days, the run has ${actual.length}`;
  }
  for (const [index, wanted] of expected.entries()) {
    const day = actual[index] as EconomyDay;
    if (differs(day, wanted)) {
      return describeDiff(day, wanted);
    }
  }
  return null;
}
