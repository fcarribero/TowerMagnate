import {
  isBasement,
  isColumn,
  isLevel,
  type ActiveEvent,
  type BombCell,
  type BombSearch,
  type BurningLevel,
  type Decision,
  type EventId,
  type FireFront,
  type FireGuard,
  type Level,
  type Notice,
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

function malformed(id: string, what: string): StateMigrationError {
  return new StateMigrationError(`Event ${id} has a malformed ${what}`);
}

function readLevelKey(key: string, id: string): Level {
  const level = Number(key);
  if (!isLevel(level)) throw malformed(id, 'level');
  return level;
}

function readPersonKey(key: string, id: string): number {
  const person = Number(key);
  if (!Number.isInteger(person) || person < 1) throw malformed(id, 'guard');
  return person;
}

function readSearch(raw: unknown, id: string): BombSearch | null {
  if (raw === null) return null;
  if (!isRecord(raw) || !isLevel(raw.bombLevel) || !isRecord(raw.levels)) {
    throw malformed(id, 'search');
  }
  if (!isRecord(raw.guards) || !isRecord(raw.unreachable)) throw malformed(id, 'search');
  const search: BombSearch = { bombLevel: raw.bombLevel, levels: {}, guards: {}, unreachable: {} };
  for (const [key, state] of Object.entries(raw.levels)) {
    if (state !== 'unsearched' && state !== 'taken' && state !== 'searched') {
      throw malformed(id, 'search level');
    }
    search.levels[readLevelKey(key, id)] = state;
  }
  for (const [key, guard] of Object.entries(raw.guards)) {
    const valid =
      isRecord(guard) && isLevel(guard.level) && (guard.endStep === null || isStep(guard.endStep));
    if (!valid) throw malformed(id, 'searching guard');
    const { level, endStep } = guard as { level: Level; endStep: number | null };
    search.guards[readPersonKey(key, id)] = { level, endStep };
  }
  for (const [key, levels] of Object.entries(raw.unreachable)) {
    if (!Array.isArray(levels) || !levels.every(isLevel)) throw malformed(id, 'unreachable list');
    search.unreachable[readPersonKey(key, id)] = [...(levels as Level[])];
  }
  return search;
}

function readBombCell(raw: unknown, id: string): BombCell {
  const valid = isRecord(raw) && isColumn(raw.x) && isLevel(raw.level);
  if (!valid) throw malformed(id, 'bomb cell');
  const { x, level } = raw as unknown as BombCell;
  return { x, level };
}

function readFront(raw: unknown, id: string): FireFront {
  const valid =
    isRecord(raw) &&
    Number.isInteger(raw.x) &&
    isStep(raw.progress) &&
    typeof raw.out === 'boolean';
  if (!valid) throw malformed(id, 'fire front');
  const { x, progress, out } = raw as unknown as FireFront;
  return { x, progress, out };
}

function readBurningLevels(raw: unknown, id: string): Partial<Record<Level, BurningLevel>> {
  if (!isRecord(raw)) throw malformed(id, 'burning levels');
  const levels: Partial<Record<Level, BurningLevel>> = {};
  for (const [key, level] of Object.entries(raw)) {
    const valid =
      isRecord(level) && isStep(level.ignitionStep) && Number.isInteger(level.ignitionColumn);
    if (!valid) throw malformed(id, 'burning level');
    levels[readLevelKey(key, id)] = {
      ignitionStep: level.ignitionStep as number,
      ignitionColumn: level.ignitionColumn as number,
      left: readFront(level.left, id),
      right: readFront(level.right, id),
    };
  }
  return levels;
}

function readFireGuards(raw: unknown, id: string): Record<number, FireGuard> {
  if (!isRecord(raw)) throw malformed(id, 'fire guards');
  const guards: Record<number, FireGuard> = {};
  for (const [key, guard] of Object.entries(raw)) {
    const valid =
      isRecord(guard) &&
      isLevel(guard.level) &&
      (guard.side === null || guard.side === 'left' || guard.side === 'right') &&
      (guard.arrivedStep === null || isStep(guard.arrivedStep));
    if (!valid) throw malformed(id, 'fire guard');
    const { level, side, arrivedStep } = guard as unknown as FireGuard;
    guards[readPersonKey(key, id)] = { level, side, arrivedStep };
  }
  return guards;
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
    return {
      kind: 'bomb',
      id: raw.id,
      decision,
      ransom: raw.ransom as number,
      bomb: readBombCell(raw.bomb, raw.id),
      search: readSearch(raw.search, raw.id),
    };
  }
  if (!isStep(raw.startStep) || !isLevel(raw.level)) {
    throw new StateMigrationError(`Fire ${raw.id} has a malformed start step or level`);
  }
  return {
    kind: 'fire',
    id: raw.id,
    decision,
    startStep: raw.startStep,
    level: raw.level,
    levels: readBurningLevels(raw.levels, raw.id),
    guards: readFireGuards(raw.guards, raw.id),
  };
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

function readNotice(raw: unknown): Notice {
  const valid =
    isRecord(raw) &&
    typeof raw.id === 'string' &&
    isStep(raw.step) &&
    typeof raw.key === 'string' &&
    (raw.unitId === null || typeof raw.unitId === 'string');
  if (!valid) {
    throw new StateMigrationError('State notice is malformed');
  }
  return {
    id: raw.id as string,
    step: raw.step as number,
    key: raw.key as string,
    unitId: raw.unitId as string | null,
  };
}

export function readNotices(raw: unknown): Notice[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new StateMigrationError('State notices must be a list');
  }
  return raw.map(readNotice);
}
