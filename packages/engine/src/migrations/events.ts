import {
  isBasement,
  isLevel,
  type ActiveEvent,
  type Decision,
  type EventId,
  type Level,
} from '@tower-magnate/shared';
import { isRecord, StateMigrationError } from './errors';

function isStep(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function readDecision(raw: unknown, id: string): Decision {
  const valid =
    isRecord(raw) &&
    isStep(raw.openStep) &&
    isStep(raw.deadlineStep) &&
    isStringList(raw.options) &&
    typeof raw.defaultChoice === 'string' &&
    raw.options.includes(raw.defaultChoice) &&
    (raw.choice === null || (typeof raw.choice === 'string' && raw.options.includes(raw.choice)));
  if (!valid) {
    throw new StateMigrationError(`Event ${id} has a malformed decision`);
  }
  return {
    openStep: raw.openStep as number,
    deadlineStep: raw.deadlineStep as number,
    options: [...(raw.options as string[])],
    defaultChoice: raw.defaultChoice as string,
    choice: raw.choice as string | null,
  };
}

function readActiveEvent(raw: unknown): ActiveEvent {
  if (
    !isRecord(raw) ||
    typeof raw.id !== 'string' ||
    (raw.kind !== 'bomb' && raw.kind !== 'fire')
  ) {
    throw new StateMigrationError('State active event is malformed');
  }
  const decision = readDecision(raw.decision, raw.id);
  if (raw.kind === 'bomb') {
    if (!Number.isSafeInteger(raw.ransom) || (raw.ransom as number) < 0) {
      throw new StateMigrationError(`Bomb threat ${raw.id} has a malformed ransom`);
    }
    return { kind: 'bomb', id: raw.id, decision, ransom: raw.ransom as number };
  }
  if (!isStep(raw.startStep)) {
    throw new StateMigrationError(`Fire ${raw.id} has a malformed start step`);
  }
  return { kind: 'fire', id: raw.id, decision, startStep: raw.startStep };
}

/** Towers saved before events existed have no `activeEvents`; they start with none. */
export function readActiveEvents(raw: unknown): ActiveEvent[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new StateMigrationError('State activeEvents must be a list');
  }
  return raw.map(readActiveEvent);
}

export function readClosedDecisions(raw: unknown): EventId[] {
  if (raw === undefined) {
    return [];
  }
  if (!isStringList(raw)) {
    throw new StateMigrationError('State closedDecisions must be a list of event ids');
  }
  return [...raw];
}

export function readTreasureLevels(raw: unknown): Level[] {
  if (raw === undefined) {
    return [];
  }
  const valid =
    Array.isArray(raw) && raw.every((level: unknown) => isLevel(level) && isBasement(level));
  if (!valid) {
    throw new StateMigrationError('State treasureLevels must be a list of basement levels');
  }
  return [...(raw as Level[])];
}
