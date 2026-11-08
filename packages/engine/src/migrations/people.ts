import { MAX_FOLLOWED_PEOPLE, PERSON_KINDS, type PersonPool } from '@tower-magnate/shared';
import { createPersonPool } from '../people';
import { isRecord, StateMigrationError } from './errors';

const SLOT_FIELDS = ['kind', 'homeUnit', 'level', 'column', 'trip', 'dueStep', 'nameSeed'] as const;

const TREK_FIELDS = [
  'trek',
  'trekLevel',
  'trekColumn',
  'trekBudget',
  'legVia',
  'legLevel',
  'legColumn',
  'legStep',
] as const;

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isFinite(item));
}

function isStrictlyIncreasing(values: number[]): boolean {
  for (let index = 1; index < values.length; index++) {
    if ((values[index] as number) <= (values[index - 1] as number)) return false;
  }
  return true;
}

function fail(reason: string): never {
  throw new StateMigrationError(`State people ${reason}`);
}

function readIds(raw: Record<string, unknown>): { nextId: number; id: number[] } {
  const { nextId, id } = raw;
  if (!Number.isInteger(nextId) || (nextId as number) < 1)
    fail('nextId must be a positive integer');
  if (!isIntegerArray(id) || !isStrictlyIncreasing(id)) fail('ids must be increasing integers');
  const first = id[0] ?? 1;
  const last = id[id.length - 1] ?? 0;
  if (first < 1 || last >= (nextId as number)) {
    fail('ids must be between 1 and nextId');
  }
  return { nextId: nextId as number, id: id.slice() };
}

function readFollowed(raw: unknown, ids: number[]): number[] {
  if (!isIntegerArray(raw) || !isStrictlyIncreasing(raw)) fail('followed must be increasing ids');
  if (raw.length > MAX_FOLLOWED_PEOPLE) fail('follow too many people');
  const known = new Set(ids);
  if (!raw.every((personId) => known.has(personId))) fail('follow someone not in the pool');
  return raw.slice();
}

/** Saves from before facing was kept have everyone facing right. */
function readFacing(raw: unknown, count: number): number[] {
  if (raw === undefined) return Array<number>(count).fill(0);
  if (!isIntegerArray(raw) || raw.length !== count || !raw.every((v) => v === 0 || v === 1)) {
    fail('facing must hold 0 or 1 per person');
  }
  return raw.slice();
}

export function readPeople(raw: unknown): PersonPool {
  if (!isRecord(raw)) fail('must be a person pool');
  const { nextId, id } = readIds(raw);
  const pool: PersonPool = { ...createPersonPool(), nextId, id };
  for (const field of SLOT_FIELDS) {
    const values = raw[field];
    if (!isIntegerArray(values) || values.length !== id.length) {
      fail(`${field} must hold one integer per person`);
    }
    pool[field] = values.slice();
  }
  if (!isNumberArray(raw.stress) || raw.stress.length !== id.length) {
    fail('stress must hold one number per person');
  }
  pool.stress = raw.stress.slice();
  if (!pool.kind.every((kind) => kind >= 0 && kind < PERSON_KINDS.length)) {
    fail('kind must index PERSON_KINDS');
  }
  for (const field of TREK_FIELDS) {
    const values = raw[field];
    if (!isIntegerArray(values) || values.length !== id.length) {
      fail(`${field} must hold one integer per person`);
    }
    pool[field] = values.slice();
  }
  pool.facing = readFacing(raw.facing, id.length);
  pool.followed = readFollowed(raw.followed, id);
  return pool;
}
