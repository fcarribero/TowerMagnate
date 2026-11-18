import { describe, expect, it } from 'vitest';
import { ClientStore } from '../model/clientStore';
import { snapshot } from '../testing/protocolFixtures';
import type { Cell } from './cellAtPoint';
import type { CellInput } from './stage';
import { bindUnitClicks, lobbyIdAt } from './unitClick';

const office = {
  id: 'u1',
  type: 'office' as const,
  x: 10,
  level: 3,
  name: null,
  price: 1,
  occupied: true,
  variant: 'occupied' as const,
};

const shaft = {
  id: 's2',
  type: 'standard' as const,
  x: 30,
  bottom: 1,
  top: 5,
  stops: [1, 5],
};

const walker = {
  id: 'p1',
  kind: 'officeWorker' as const,
  x: 14.4,
  level: 3,
  facing: 'right' as const,
  mode: 'walk' as const,
  carRef: null,
  stress: 'normal' as const,
};

const rider = { ...walker, id: 'p2', x: 30, level: 4, mode: 'ride' as const };

/** A walker in the hall, outside any unit. */
const hallWalker = { ...walker, id: 'p3', x: 24.4 };

function setup() {
  const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
  store.applySnapshot({
    ...snapshot,
    units: [office],
    shafts: [shaft],
    people: [walker, rider, hallWalker],
  });
  let input: (event: CellInput) => void = () => undefined;
  const opened: string[] = [];
  const cleared = { count: 0 };
  bindUnitClicks({ onCellInput: (listener) => ((input = listener), () => undefined) }, store, {
    person: (id) => opened.push(`person:${id}`),
    unit: (id) => opened.push(id),
    shaft: (id) => opened.push(`shaft:${id}`),
    clearUnit: () => {
      cleared.count += 1;
    },
  });
  const press = (cell: Cell | null, upOffset = 0): void => {
    input({ kind: 'down', cell, clientX: 100, clientY: 100 });
    input({ kind: 'up', cell, clientX: 100 + upOffset, clientY: 100 });
  };
  return { click: (cell: Cell) => press(cell), press, opened, cleared };
}

describe('bindUnitClicks', () => {
  it('opens the window of the unit under the click', () => {
    const { click, opened } = setup();
    click({ x: 10, level: 3 });
    expect(opened).toEqual(['u1']);
  });

  it('opens the window of a person in the hall', () => {
    const { click, opened } = setup();
    click({ x: 24, level: 3 });
    click({ x: 25, level: 3 });
    expect(opened).toEqual(['person:p3', 'person:p3']);
  });

  it('opens the unit, not the person, for someone inside a unit', () => {
    const { click, opened } = setup();
    click({ x: 14, level: 3 });
    expect(opened).toEqual(['u1']);
  });

  it('does not pick a rider', () => {
    const { click, opened } = setup();
    click({ x: 30, level: 4 });
    expect(opened).toEqual(['shaft:s2']);
  });

  it('opens the window of the shaft under the click', () => {
    const { click, opened } = setup();
    click({ x: 33, level: 4 });
    expect(opened).toEqual(['shaft:s2']);
  });

  it('opens the shaft from its machine room above the top and its pit below the bottom', () => {
    const { click, opened } = setup();
    click({ x: 31, level: 6 });
    click({ x: 31, level: -1 });
    expect(opened).toEqual(['shaft:s2', 'shaft:s2']);
  });

  it('ignores a click beside the shaft or past its machine room', () => {
    const { click, opened } = setup();
    click({ x: 34, level: 4 });
    click({ x: 31, level: 7 });
    expect(opened).toEqual([]);
  });

  it('ignores a click on an empty cell', () => {
    const { click, opened } = setup();
    click({ x: 0, level: 3 });
    expect(opened).toEqual([]);
  });

  it('clears the unit panel on a click away from a unit, not on a unit click or a drag', () => {
    const { click, press, cleared } = setup();
    click({ x: 10, level: 3 });
    expect(cleared.count).toBe(0);
    press({ x: 0, level: 3 }, 20);
    expect(cleared.count).toBe(0);
    click({ x: 0, level: 3 });
    click({ x: 33, level: 4 });
    click({ x: 24, level: 3 });
    press(null);
    expect(cleared.count).toBe(4);
  });

  it('ignores a press that dragged the view', () => {
    const { press, opened } = setup();
    press({ x: 10, level: 3 }, 20);
    expect(opened).toEqual([]);
  });
});

describe('bindUnitClicks priority', () => {
  function bind(personIdAt?: (x: number, y: number) => string | null) {
    const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
    // A room that shares its cell with the shaft in front of it, and a walker on the same level.
    const behind = { ...office, x: 30, level: 3 };
    store.applySnapshot({ ...snapshot, units: [behind], shafts: [shaft], people: [walker] });
    let input: (event: CellInput) => void = () => undefined;
    const opened: string[] = [];
    bindUnitClicks({ onCellInput: (l) => ((input = l), () => undefined), personIdAt }, store, {
      person: (id) => opened.push(`person:${id}`),
      unit: (id) => opened.push(id),
      shaft: (id) => opened.push(`shaft:${id}`),
    });
    return (cell: Cell, world?: { x: number; y: number }) => {
      opened.length = 0;
      input({ kind: 'down', cell, clientX: 1, clientY: 1, world });
      input({ kind: 'up', cell, clientX: 1, clientY: 1, world });
      return opened.at(-1);
    };
  }

  it('picks the elevator shaft in front of a room drawn behind it', () => {
    expect(bind()({ x: 30, level: 3 })).toBe('shaft:s2');
  });

  it('picks a person only when the pointer is on the body, not above it', () => {
    const click = bind((x, y) => (y > 90 ? 'p1' : null));
    expect(click({ x: 14, level: 3 }, { x: 115, y: 100 })).toBe('person:p1');
    expect(click({ x: 14, level: 3 }, { x: 115, y: 70 })).toBeUndefined();
  });

  it('skips a person the sprites find inside a unit, and opens the unit', () => {
    const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
    store.applySnapshot({ ...snapshot, units: [office], shafts: [], people: [walker] });
    let input: (event: CellInput) => void = () => undefined;
    const opened: string[] = [];
    bindUnitClicks(
      { onCellInput: (l) => ((input = l), () => undefined), personIdAt: () => 'p1' },
      store,
      {
        person: (id) => opened.push(`person:${id}`),
        unit: (id) => opened.push(id),
        shaft: (id) => opened.push(`shaft:${id}`),
      },
    );
    const cell = { x: 14, level: 3 };
    input({ kind: 'down', cell, clientX: 1, clientY: 1, world: { x: 145, y: 100 } });
    input({ kind: 'up', cell, clientX: 1, clientY: 1, world: { x: 145, y: 100 } });
    expect(opened).toEqual(['u1']);
  });
});

describe('lobbyIdAt', () => {
  const source = {
    mainLobbyHeight: 2 as const,
    skyLobbyHeights: { '15': 1 as const },
    structure: new Map([
      [1, '....llllll..ll'],
      [2, '....llllll....'],
      [3, '....ffffff....'],
      [15, 'ffllll'],
    ]),
  };

  it('names the lobby run by its base level and first column', () => {
    expect(lobbyIdAt(source, { x: 7, level: 1 })).toBe('l1x4');
    expect(lobbyIdAt(source, { x: 13, level: 1 })).toBe('l1x12');
    expect(lobbyIdAt(source, { x: 3, level: 15 })).toBe('l15x2');
  });

  it('takes an upper row of a tall lobby to its base run, and skips cells that are not lobby', () => {
    expect(lobbyIdAt(source, { x: 5, level: 2 })).toBe('l1x4');
    expect(lobbyIdAt(source, { x: 5, level: 3 })).toBeNull();
    expect(lobbyIdAt(source, { x: 1, level: 1 })).toBeNull();
    expect(lobbyIdAt(source, { x: 0, level: 15 })).toBeNull();
  });
});
