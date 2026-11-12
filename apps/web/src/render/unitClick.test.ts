import { describe, expect, it } from 'vitest';
import { ClientStore } from '../model/clientStore';
import { snapshot } from '../testing/protocolFixtures';
import type { Cell } from './cellAtPoint';
import type { CellInput } from './stage';
import { bindUnitClicks } from './unitClick';

const office = {
  id: 'u1',
  type: 'office' as const,
  x: 10,
  level: 3,
  name: null,
  price: 'normal' as const,
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

function setup() {
  const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
  store.applySnapshot({ ...snapshot, units: [office], shafts: [shaft], people: [walker, rider] });
  let input: (event: CellInput) => void = () => undefined;
  const opened: string[] = [];
  bindUnitClicks({ onCellInput: (listener) => ((input = listener), () => undefined) }, store, {
    person: (id) => opened.push(`person:${id}`),
    unit: (id) => opened.push(id),
    shaft: (id) => opened.push(`shaft:${id}`),
  });
  const press = (cell: Cell | null, upOffset = 0): void => {
    input({ kind: 'down', cell, clientX: 100, clientY: 100 });
    input({ kind: 'up', cell, clientX: 100 + upOffset, clientY: 100 });
  };
  return { click: (cell: Cell) => press(cell), press, opened };
}

describe('bindUnitClicks', () => {
  it('opens the window of the unit under the click', () => {
    const { click, opened } = setup();
    click({ x: 10, level: 3 });
    expect(opened).toEqual(['u1']);
  });

  it('opens the window of the person before the unit behind them', () => {
    const { click, opened } = setup();
    click({ x: 14, level: 3 });
    click({ x: 15, level: 3 });
    click({ x: 16, level: 3 });
    expect(opened).toEqual(['person:p1', 'person:p1', 'u1']);
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

  it('ignores a click beside or above the shaft', () => {
    const { click, opened } = setup();
    click({ x: 34, level: 4 });
    click({ x: 31, level: 6 });
    expect(opened).toEqual([]);
  });

  it('ignores a click on an empty cell', () => {
    const { click, opened } = setup();
    click({ x: 0, level: 3 });
    expect(opened).toEqual([]);
  });

  it('ignores a press that dragged the view', () => {
    const { press, opened } = setup();
    press({ x: 10, level: 3 }, 20);
    expect(opened).toEqual([]);
  });
});
