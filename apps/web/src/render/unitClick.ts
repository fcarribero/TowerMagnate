import {
  SHAFT_UNIT_TYPES,
  UNIT_CATALOG,
  type PersonView,
  type Level,
  type ShaftView,
} from '@tower-magnate/shared';
import type { ClientStore } from '../model/clientStore';
import type { Cell } from './cellAtPoint';
import { levelToIndex } from './levels';
import { unitAt } from './placementCheck';

export interface ClickStage {
  onCellInput(
    listener: (input: {
      kind: 'down' | 'up' | 'cancel';
      cell: Cell | null;
      clientX: number;
      clientY: number;
      world?: { x: number; y: number };
    }) => void,
  ): () => void;
  /** The drawn person under a world point; when missing, the person on the clicked tile is used. */
  personIdAt?(worldX: number, worldY: number): string | null;
}

/** A press that moves farther than this many CSS pixels is a drag, not a click. */
const CLICK_MOVE_LIMIT = 4;

export interface InspectWindowOpeners {
  person: (personId: string) => void;
  unit: (unitId: string) => void;
  shaft: (shaftId: string) => void;
  /** A click on lobby cells with no unit in front asks for the lobby's window. */
  lobby?: (lobbyId: string) => void;
  /** A click that lands on no unit: the fixed unit panel goes away. */
  clearUnit?: () => void;
}

/**
 * The shaft drawn on the cell: its levels plus the machine room drawn on the level above the top
 * and the pit drawn on the level below the bottom.
 */
function shaftAt(shafts: Iterable<ShaftView>, cell: Cell): ShaftView | null {
  const index = levelToIndex(cell.level);
  for (const shaft of shafts) {
    const width = UNIT_CATALOG[SHAFT_UNIT_TYPES[shaft.type]].width;
    const insideColumns = cell.x >= shaft.x && cell.x < shaft.x + width;
    const insideLevels =
      index >= levelToIndex(shaft.bottom) - 1 && index <= levelToIndex(shaft.top) + 1;
    if (insideColumns && insideLevels) {
      return shaft;
    }
  }
  return null;
}

interface LobbySource {
  mainLobbyHeight: 1 | 2 | 3 | null;
  skyLobbyHeights?: Readonly<Record<string, 1 | 2 | 3>>;
  structure: ReadonlyMap<Level, string>;
}

/**
 * The lobby a cell belongs to, as the engine names it: `l<base level>x<first column>`. A cell on
 * an upper row of a tall lobby belongs to the lobby run below it on the base level.
 */
export function lobbyIdAt(source: LobbySource, cell: Cell): string | null {
  const bases: [number, number][] = [];
  if (source.mainLobbyHeight !== null) bases.push([1, source.mainLobbyHeight]);
  for (const [base, height] of Object.entries(source.skyLobbyHeights ?? {})) {
    bases.push([Number(base), height]);
  }
  for (const [base, height] of bases) {
    if (cell.level < base || cell.level >= base + height) continue;
    const row = source.structure.get(base as Level);
    if (row === undefined || row[cell.x] !== 'l') continue;
    if (source.structure.get(cell.level)?.[cell.x] !== 'l') continue;
    let x0 = cell.x;
    while (x0 > 0 && row[x0 - 1] === 'l') x0--;
    return `l${base}x${x0}`;
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

/** With the inspect tool, a click on a person, a unit, an elevator shaft or a lobby asks for its window. */
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
    // What is drawn in front wins: people, then elevator shafts, then the units behind them.
    const personId =
      input.world !== undefined && stage.personIdAt !== undefined
        ? stage.personIdAt(input.world.x, input.world.y)
        : (personAt(latest.people.values(), input.cell)?.id ?? null);
    if (personId !== null) {
      open.clearUnit?.();
      open.person(personId);
      return;
    }
    const shaft = shaftAt(latest.shafts.values(), input.cell);
    if (shaft !== null) {
      open.clearUnit?.();
      open.shaft(shaft.id);
      return;
    }
    const unit = unitAt(latest.units.values(), input.cell.x, input.cell.level);
    if (unit !== null) {
      open.unit(unit.id);
      return;
    }
    const lobbyId = open.lobby === undefined ? null : lobbyIdAt(latest, input.cell);
    if (lobbyId !== null) {
      open.clearUnit?.();
      open.lobby?.(lobbyId);
      return;
    }
    open.clearUnit?.();
  });
}
