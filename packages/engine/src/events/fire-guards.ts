import {
  FIRE_FRONT_CONTAINMENT,
  FIRE_SPREAD_STEPS,
  isColumn,
  type BurningLevel,
  type Fire,
  type FireGuard,
  type FireSide,
  type Level,
} from '@tower-magnate/shared';
import { structureAt } from '../grid';
import { slotOfPerson } from '../people';
import type { StepContext } from '../step';
import { cancelTrek, isOnTrek } from '../trek';
import { burnCell, nearestWalkableColumn, noDamage, type FireDamage } from './fire-cells';
import { forget, guardSlots, sendGuard } from './guards';

const SIDES: readonly FireSide[] = ['left', 'right'];

export function isBurning(level: BurningLevel): boolean {
  return !level.left.out || !level.right.out;
}

export function burningLevels(fire: Fire): Level[] {
  return Object.keys(fire.levels)
    .map(Number)
    .filter((level) => isBurning(fire.levels[level] as BurningLevel))
    .sort((a, b) => a - b);
}

function guardNumbers(fire: Fire): number[] {
  return Object.keys(fire.guards)
    .map(Number)
    .sort((a, b) => a - b);
}

function guardsOnLevel(fire: Fire, level: Level): number {
  return Object.values(fire.guards).filter((guard) => guard.level === level).length;
}

function guardsOnFront(fire: Fire, level: Level, side: FireSide): FireGuard[] {
  return Object.values(fire.guards).filter((guard) => guard.level === level && guard.side === side);
}

/** The burning level with the fewest guards, the higher level on a tie. */
function levelNeedingGuards(fire: Fire): Level | null {
  let best: Level | null = null;
  let fewest = Infinity;
  for (const level of burningLevels(fire)) {
    const count = guardsOnLevel(fire, level);
    if (count < fewest || (count === fewest && best !== null && level > best)) {
      best = level;
      fewest = count;
    }
  }
  return best;
}

/**
 * Events 5.7: every guard without a target takes the burning level with the fewest guards and
 * goes to the walkable cell nearest its ignition column, since burned cells are ruins. A guard
 * with no route keeps no target until the next pick.
 */
export function pickFireTargets(context: StepContext, fire: Fire): void {
  const pool = context.state.people;
  for (const slot of guardSlots(pool)) {
    const person = pool.id[slot] as number;
    if (Object.hasOwn(fire.guards, person)) continue;
    const level = levelNeedingGuards(fire);
    if (level === null) return;
    const ignition = (fire.levels[level] as BurningLevel).ignitionColumn;
    const column = nearestWalkableColumn(context.state, level, ignition);
    if (column !== null && sendGuard(context, slot, { level, column })) {
      fire.guards[person] = { level, side: null, arrivedStep: null };
    }
  }
}

function sideWithFewerGuards(fire: Fire, level: Level): FireSide {
  const left = guardsOnFront(fire, level, 'left').length;
  const right = guardsOnFront(fire, level, 'right').length;
  return right < left ? 'right' : 'left';
}

/** Guards that finished their trip join a front; guards of a level that went out are freed. */
function settleGuards(context: StepContext, fire: Fire): boolean {
  const pool = context.state.people;
  let freed = false;
  for (const person of guardNumbers(fire)) {
    const guard = fire.guards[person] as FireGuard;
    const slot = slotOfPerson(pool, person);
    const burning = fire.levels[guard.level];
    if (slot < 0 || !burning || !isBurning(burning)) {
      if (slot >= 0) cancelTrek(context, slot);
      forget(fire.guards, person);
      freed = true;
    } else if (guard.side === null && !isOnTrek(pool, slot)) {
      if (pool.level[slot] === guard.level) {
        guard.side = sideWithFewerGuards(fire, guard.level);
        guard.arrivedStep = context.state.step;
      } else {
        forget(fire.guards, person);
      }
    }
  }
  return freed;
}

/** A front is out: its guards join the other front of the level while that one still burns. */
function moveGuardsOffFront(fire: Fire, level: Level, side: FireSide): void {
  const burning = fire.levels[level] as BurningLevel;
  const other: FireSide = side === 'left' ? 'right' : 'left';
  for (const [person, guard] of Object.entries(fire.guards)) {
    if (guard.level !== level || guard.side !== side) continue;
    if (burning[other].out) forget(fire.guards, Number(person));
    else guard.side = other;
  }
}

function spreadFront(
  context: StepContext,
  level: Level,
  burning: BurningLevel,
  side: FireSide,
  damage: FireDamage,
) {
  const front = burning[side];
  const next = side === 'left' ? front.x - 1 : front.x + 1;
  if (!isColumn(next) || structureAt(context.state.grid, level, next) === null) {
    front.out = true;
  } else {
    front.x = next;
    burnCell(context.state, level, next, damage);
  }
}

function isMinuteTick(step: number, burning: BurningLevel): boolean {
  const age = step - burning.ignitionStep;
  return age > 0 && age % FIRE_SPREAD_STEPS === 0;
}

/**
 * Events phase item 7, containment and spread: on every minute after a level ignited, each front
 * that is not out takes the progress of the guards that arrived at an earlier step, and is out at
 * FIRE_FRONT_CONTAINMENT; otherwise it moves one column away from the ignition column and burns
 * the cell it reaches into `damage`. Returns true when a level went out.
 */
export function tickFireFronts(
  context: StepContext,
  fire: Fire,
  damage: FireDamage = noDamage(),
): boolean {
  const { step } = context.state;
  let levelWentOut = false;
  for (const level of burningLevels(fire)) {
    const burning = fire.levels[level] as BurningLevel;
    if (!isMinuteTick(step, burning)) continue;
    const wentOut: FireSide[] = [];
    for (const side of SIDES) {
      const front = burning[side];
      if (front.out) continue;
      const fighting = guardsOnFront(fire, level, side).filter(
        (guard) => guard.arrivedStep !== null && guard.arrivedStep < step,
      );
      front.progress += fighting.length;
      if (front.progress >= FIRE_FRONT_CONTAINMENT) front.out = true;
      else spreadFront(context, level, burning, side, damage);
      if (front.out) wentOut.push(side);
    }
    for (const side of wentOut) moveGuardsOffFront(fire, level, side);
    if (!isBurning(burning)) levelWentOut = true;
  }
  return levelWentOut;
}

/** Events phase item 9: settle arrivals, free guards of levels that went out, then pick again. */
export function runFireGuards(context: StepContext, fire: Fire, levelWentOut: boolean): void {
  const freed = settleGuards(context, fire);
  if (freed || levelWentOut) pickFireTargets(context, fire);
}
