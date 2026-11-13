import {
  SHAFT_UNIT_TYPES,
  UNIT_CATALOG,
  type PersonView,
  type ShaftView,
} from '@tower-magnate/shared';
import type { ClientStore } from '../model/clientStore';
import type { Cell } from './cellAtPoint';
import { unitAt } from './placementCheck';

export interface ClickStage {
  onCellInput(
    listener: (input: {
      kind: 'down' | 'up' | 'cancel';
      cell: Cell | null;
      clientX: number;
      clientY: number;
    }) => void,
  ): () => void;
}

/** A press that moves farther than this many CSS pixels is a drag, not a click. */
const CLICK_MOVE_LIMIT = 4;

export interface InspectWindowOpeners {
  person: (personId: string) => void;
  unit: (unitId: string) => void;
  shaft: (shaftId: string) => void;
  /** A click that lands on no unit: the fixed unit panel goes away. */
  clearUnit?: () => void;
}

function shaftAt(shafts: Iterable<ShaftView>, cell: Cell): ShaftView | null {
  for (const shaft of shafts) {
    const width = UNIT_CATALOG[SHAFT_UNIT_TYPES[shaft.type]].width;
    const insideColumns = cell.x >= shaft.x && cell.x < shaft.x + width;
    if (insideColumns && cell.level >= shaft.bottom && cell.level <= shaft.top) {
      return shaft;
    }
  }
  return null;
}

/** Walking, waiting and stair people are drawn on the floor; riders and people inside are not. */
function isDrawnOnFloor(person: PersonView): boolean {
  return person.mode !== 'ride' && person.mode !== 'inside';
}

/** The person drawn on the cell, the nearest one when several overlap it. */
export function personAt(people: Iterable<PersonView>, cell: Cell): PersonView | null {
  let nearest: PersonView | null = null;
  let nearestDistance = 1;
  for (const person of people) {
    if (person.level !== cell.level || !isDrawnOnFloor(person)) {
      continue;
    }
    const distance = Math.abs(person.x - cell.x);
    if (distance < nearestDistance) {
      nearest = person;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** With the inspect tool, a click on a person, a unit or an elevator shaft asks for its window. */
export function bindUnitClicks(
  stage: ClickStage,
  store: ClientStore,
  open: InspectWindowOpeners,
): () => void {
  let press: { clientX: number; clientY: number } | null = null;
  return stage.onCellInput((input) => {
    if (input.kind === 'down') {
      press = { clientX: input.clientX, clientY: input.clientY };
      return;
    }
    const started = press;
    press = null;
    if (input.kind !== 'up' || started === null) {
      return;
    }
    const moved = Math.hypot(input.clientX - started.clientX, input.clientY - started.clientY);
    if (moved > CLICK_MOVE_LIMIT) {
      return;
    }
    const latest = store.current?.latest;
    if (input.cell === null || latest === undefined) {
      open.clearUnit?.();
      return;
    }
    const person = personAt(latest.people.values(), input.cell);
    if (person !== null) {
      open.clearUnit?.();
      open.person(person.id);
      return;
    }
    const unit = unitAt(latest.units.values(), input.cell.x, input.cell.level);
    if (unit !== null) {
      open.unit(unit.id);
      return;
    }
    open.clearUnit?.();
    const shaft = shaftAt(latest.shafts.values(), input.cell);
    if (shaft !== null) {
      open.shaft(shaft.id);
    }
  });
}
