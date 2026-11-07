import {
  CLOSED_DECISIONS_KEPT,
  DECISION_DEADLINE_STEPS,
  HELICOPTER_COST,
  type ActiveEvent,
  type BombThreat,
  type DecisionKind,
  type ErrorCode,
  type EventId,
  type Fire,
  type TowerState,
} from '@tower-magnate/shared';
import { chargeMoney } from '../money';
import type { StepContext } from '../step';

interface DecisionRule {
  /** Dialog order, default last. */
  options: readonly string[];
  defaultChoice: string;
  cost(event: ActiveEvent, choice: string): number;
}

const DECISION_RULES: Readonly<Record<DecisionKind, DecisionRule>> = {
  bomb: {
    options: ['pay', 'refuse'],
    defaultChoice: 'refuse',
    cost: (event, choice) => (event.kind === 'bomb' && choice === 'pay' ? event.ransom : 0),
  },
  fire: {
    options: ['helicopter', 'burn'],
    defaultChoice: 'burn',
    cost: (_event, choice) => (choice === 'helicopter' ? HELICOPTER_COST : 0),
  },
};

function newEventId(state: TowerState): EventId {
  const id = `e${state.nextId}`;
  state.nextId += 1;
  return id;
}

function openDecision(state: TowerState, kind: DecisionKind) {
  return {
    id: newEventId(state),
    decision: {
      openStep: state.step,
      deadlineStep: state.step + DECISION_DEADLINE_STEPS,
      options: [...DECISION_RULES[kind].options],
      defaultChoice: DECISION_RULES[kind].defaultChoice,
      choice: null,
    },
  };
}

function hasActiveDisaster(state: TowerState): boolean {
  return state.activeEvents.some((event) => event.kind === 'bomb' || event.kind === 'fire');
}

function emitOpened(context: StepContext, event: ActiveEvent): void {
  context.events.push({
    type: 'decisionOpened',
    step: context.state.step,
    eventId: event.id,
    kind: event.kind,
    deadlineStep: event.decision.deadlineStep,
    options: [...event.decision.options],
  });
}

/** Opens a bomb threat with its ransom decision, or returns null while a disaster is active. */
export function openBombThreat(context: StepContext, ransom: number): BombThreat | null {
  if (hasActiveDisaster(context.state)) {
    return null;
  }
  const bomb: BombThreat = { kind: 'bomb', ...openDecision(context.state, 'bomb'), ransom };
  context.state.activeEvents.push(bomb);
  emitOpened(context, bomb);
  return bomb;
}

/** Opens a fire with its helicopter decision, or returns null while a disaster is active. */
export function openFire(context: StepContext): Fire | null {
  if (hasActiveDisaster(context.state)) {
    return null;
  }
  const fire: Fire = {
    kind: 'fire',
    ...openDecision(context.state, 'fire'),
    startStep: context.state.step,
  };
  context.state.activeEvents.push(fire);
  emitOpened(context, fire);
  return fire;
}

function rememberClosed(state: TowerState, id: EventId): void {
  state.closedDecisions.push(id);
  if (state.closedDecisions.length > CLOSED_DECISIONS_KEPT) {
    state.closedDecisions.shift();
  }
}

function isOpen(event: ActiveEvent): boolean {
  return event.decision.choice === null;
}

function closeDecision(state: TowerState, event: ActiveEvent, choice: string): void {
  event.decision.choice = choice;
  rememberClosed(state, event.id);
}

export type AnswerResult = { ok: true; cost: number } | { ok: false; error: ErrorCode };

export function answerDecision(state: TowerState, eventId: string, choice: string): AnswerResult {
  const event = state.activeEvents.find((active) => active.id === eventId);
  const open = event !== undefined && isOpen(event);
  if (!open && !state.closedDecisions.includes(eventId)) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  if (!open || state.step >= event.decision.deadlineStep) {
    return { ok: false, error: 'EVENT_EXPIRED' };
  }
  if (!event.decision.options.includes(choice)) {
    return { ok: false, error: 'INVALID_CHOICE' };
  }
  closeDecision(state, event, choice);
  const cost = DECISION_RULES[event.kind].cost(event, choice);
  if (cost > 0) {
    chargeMoney(state, 'events', cost);
  }
  return { ok: true, cost };
}

/** Default choices cost nothing. */
function closeWithDefault(context: StepContext, event: ActiveEvent): void {
  const choice = event.decision.defaultChoice;
  closeDecision(context.state, event, choice);
  context.events.push({
    type: 'decisionClosed',
    step: context.state.step,
    eventId: event.id,
    choice,
  });
}

/** Events phase item 1: open decisions that reach their deadline take the default. */
export function runDecisionDeadlines(context: StepContext): void {
  for (const event of context.state.activeEvents) {
    if (isOpen(event) && context.state.step >= event.decision.deadlineStep) {
      closeWithDefault(context, event);
      context.events.push({
        type: 'news',
        step: context.state.step,
        key: 'news.decisionDefault',
        eventId: event.id,
        choice: event.decision.defaultChoice,
      });
    }
  }
}

/**
 * Removes a finished disaster. A decision still open closes with its default, without the
 * default notice, since the notice that ends the disaster is enough.
 */
export function endDisaster(context: StepContext, eventId: EventId): void {
  const event = context.state.activeEvents.find((active) => active.id === eventId);
  if (!event) {
    return;
  }
  if (isOpen(event)) {
    closeWithDefault(context, event);
  }
  context.state.activeEvents = context.state.activeEvents.filter((active) => active !== event);
}
