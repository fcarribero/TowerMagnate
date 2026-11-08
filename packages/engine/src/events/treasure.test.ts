import type { Command, TowerState } from '@tower-magnate/shared';
import { MONEY_CAP } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { clearStructure, setStructure } from '../grid';
import { createTower } from '../state';
import { step } from '../step';

/** Basements are floored over columns 0 to 40; the dug levels are left open at 10-13 and 20-23. */
function towerWithBasementRoom(seed: number, dugLevels: number[] = []): TowerState {
  const tower = createTower(seed);
  setStructure(tower.grid, 1, 0, 40, 'lobby');
  tower.grid.mainLobbyHeight = 1;
  for (let level = -1; level >= -9; level--) {
    setStructure(tower.grid, level, 0, 40, 'floor');
  }
  for (const level of dugLevels) {
    clearStructure(tower.grid, level, 10, 13);
    clearStructure(tower.grid, level, 20, 23);
  }
  tower.money = 5_000_000;
  return tower;
}

function dig(levels: number[]): Command[] {
  return levels.map((level) => ({ type: 'buildFloor', level, x0: 10, x1: 13 }));
}

function digOnce(tower: TowerState, levels: number[]) {
  const commands = dig(levels).map((command, index) => ({ id: `c${index}`, command }));
  return step(tower, commands, 0);
}

/** First tower, in seed order, whose next dig of these levels finds treasure. */
function luckyTower(levels: number[], prepare?: (tower: TowerState) => void): TowerState {
  for (let seed = 1; seed < 500; seed++) {
    const tower = towerWithBasementRoom(seed, levels);
    prepare?.(tower);
    if (digOnce(tower, levels).state.treasureLevels.length > tower.treasureLevels.length) {
      return tower;
    }
  }
  throw new Error('No seed found treasure');
}

describe('basement treasure', () => {
  it('pays the band amount into the events ledger and reports it', () => {
    const tower = luckyTower([-4]);
    const result = digOnce(tower, [-4]);
    const income = result.state.ledger.currentWeek.events.income;
    expect(income).toBe(100_000);
    expect(result.state.treasureLevels).toEqual([-4]);
    expect(result.events).toContainEqual({
      type: 'treasureFound',
      step: 0,
      commandId: 'c0',
      level: -4,
      amount: 100_000,
    });
    expect(result.events).toContainEqual({
      type: 'news',
      step: 0,
      commandId: 'c0',
      key: 'news.treasure',
      level: -4,
    });
  });

  it.each([
    [-2, 50_000],
    [-6, 100_000],
    [-9, 200_000],
  ])('pays level %i the band amount %i', (level, amount) => {
    const result = digOnce(luckyTower([level]), [level]);
    expect(result.state.ledger.currentWeek.events.income).toBe(amount);
  });

  it('never rolls again for a level that gave treasure', () => {
    const tower = luckyTower([-4]);
    const found = digOnce(tower, [-4]).state;
    const again = step(
      found,
      [{ id: 'c9', command: { type: 'buildFloor', level: -4, x0: 20, x1: 23 } }],
      0,
    );
    expect(again.state.rng).toEqual(found.rng);
    expect(again.state.treasureLevels).toEqual([-4]);
  });

  it('rolls for the deepest dug level, then for the next one once it has given treasure', () => {
    const tower = luckyTower([-3, -5]);
    expect(digOnce(tower, [-3, -5]).state.treasureLevels).toContain(-5);

    const deepAlreadyGave = luckyTower([-3, -5], (candidate) => {
      candidate.treasureLevels = [-5];
    });
    const result = digOnce(deepAlreadyGave, [-3, -5]);
    expect(result.state.treasureLevels).toContain(-3);
  });

  it('does not draw when the command adds no new basement cell', () => {
    const tower = towerWithBasementRoom(1);
    const result = step(
      tower,
      [{ id: 'c1', command: { type: 'buildFloor', level: 3, x0: 0, x1: 1 } }],
      0,
    );
    expect(result.state.rng).toEqual(tower.rng);
  });

  it('does not draw when every dug level has given treasure', () => {
    const tower = towerWithBasementRoom(1, [-4]);
    tower.treasureLevels = [-4];
    const result = digOnce(tower, [-4]);
    expect(result.state.rng).toEqual(tower.rng);
  });

  it('respects the money cap', () => {
    const tower = luckyTower([-4], (candidate) => {
      candidate.money = MONEY_CAP - 10_000;
    });
    const result = digOnce(tower, [-4]);
    expect(result.state.money).toBe(MONEY_CAP);
    expect(result.state.treasureLevels).toEqual([-4]);
  });
});
