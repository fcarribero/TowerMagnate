import type { ShaftView } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { walker } from '../testing/protocolFixtures';
import {
  carInRange,
  carOrigin,
  planShaft,
  riderPlace,
  riderSlotCount,
  floorSprite,
  riderSprite,
} from './elevatorPlan';
import { levelToIndex, levelTop } from './levels';

const shaft: ShaftView = {
  id: 's4',
  type: 'standard',
  x: 100,
  bottom: -1,
  top: 2,
  stops: [-1, 1],
};

const BUILT_ROW = 'f'.repeat(200);
const structure = new Map([-1, 1, 2].map((level) => [level, BUILT_ROW] as const));

describe('planShaft', () => {
  const pieces = planShaft(shaft, structure);

  it('draws one body per level and never a level 0', () => {
    const bodies = pieces.filter((piece) => piece.sprite.endsWith('/body'));
    expect(bodies.map((piece) => piece.index)).toEqual([
      levelToIndex(-1),
      levelToIndex(1),
      levelToIndex(2),
    ]);
  });

  it('backs a level with brick where nothing is built behind the shaft', () => {
    const partial = new Map(structure);
    partial.set(2, '.'.repeat(200));
    partial.set(1, `${'f'.repeat(101)}${'.'.repeat(99)}`);
    const backdrops = planShaft(shaft, partial)
      .filter((piece) => piece.sprite.endsWith('/body') || piece.sprite.endsWith('/brick'))
      .map((piece) => [piece.index, piece.sprite.split('/')[2]]);
    expect(backdrops).toEqual([
      [levelToIndex(-1), 'body'],
      [levelToIndex(1), 'brick'],
      [levelToIndex(2), 'brick'],
    ]);
  });

  it('puts a landing on every stop', () => {
    const landings = pieces.filter((piece) => piece.sprite.endsWith('/landing'));
    expect(landings.map((piece) => piece.index)).toEqual([levelToIndex(-1), levelToIndex(1)]);
  });

  it('puts the machine room over the top level and the pit under the bottom one', () => {
    expect(pieces.find((piece) => piece.sprite.endsWith('/top'))).toMatchObject({
      index: levelToIndex(2),
      y: -32,
    });
    expect(pieces.find((piece) => piece.sprite.endsWith('/bottom'))).toMatchObject({
      index: levelToIndex(-1),
      y: 32,
    });
  });

  it('uses the sprites of the shaft type at the shaft column', () => {
    const express = planShaft({ ...shaft, type: 'express' }, structure);
    expect(express.every((piece) => piece.sprite.startsWith('transport/express-shaft/'))).toBe(
      true,
    );
    expect(express.every((piece) => piece.x === 800)).toBe(true);
  });
});

describe('carOrigin', () => {
  it('centres the car in the shaft and rests it on the floor of its level', () => {
    const index = levelToIndex(3);
    expect(carOrigin(shaft, index)).toEqual({ x: 800, y: levelTop(index) });
  });

  it('moves up the screen by one floor per level index', () => {
    const low = carOrigin(shaft, 10);
    const high = carOrigin(shaft, 11);
    expect(low.y - high.y).toBe(32);
  });

  it('puts a car between S1 and level 1 half a floor from each', () => {
    const between = carOrigin(shaft, levelToIndex(-1) + 0.5);
    const lower = carOrigin(shaft, levelToIndex(-1));
    const upper = carOrigin(shaft, levelToIndex(1));
    expect(lower.y - between.y).toBe(16);
    expect(between.y - upper.y).toBe(16);
  });

  it('keeps pixel positions whole', () => {
    expect(Number.isInteger(carOrigin(shaft, 10.37).y)).toBe(true);
  });
});

describe('carInRange', () => {
  const range = { lowest: 10, highest: 20 };

  it('shows a car that overlaps the range by any part', () => {
    expect(carInRange(9.5, range)).toBe(true);
    expect(carInRange(20.5, range)).toBe(true);
  });

  it('hides a car fully outside the range', () => {
    expect(carInRange(9, range)).toBe(false);
    expect(carInRange(21, range)).toBe(false);
  });
});

describe('riders', () => {
  it('fits fewer riders in a standard car than in an express car', () => {
    expect(riderSlotCount('standard')).toBeLessThan(riderSlotCount('express'));
  });

  it('wraps riders around the slots of the car', () => {
    const slots = riderSlotCount('standard');
    expect(riderPlace('standard', slots)).toEqual(riderPlace('standard', 0));
    expect(riderPlace('standard', 1).x).toBeGreaterThan(riderPlace('standard', 0).x);
  });

  it('picks the look from the person id and the tint from stress', () => {
    expect(riderSprite({ ...walker, id: 'p6', stress: 'normal' })).toEqual({
      subject: 'people/worker-c',
      state: 'stand',
    });
    expect(riderSprite({ ...walker, id: 'p4', kind: 'guard', stress: 'veryStressed' })).toEqual({
      subject: 'people/security-a',
      state: 'stand-red',
    });
  });

  it('draws staff with their own look and with a garbage bag while they carry one', () => {
    const staff = { ...walker, id: 'p4', kind: 'staff', stress: 'normal' } as const;
    expect(riderSprite(staff).subject).toBe('people/staff-a');
    expect(riderSprite({ ...staff, carrying: true }).subject).toBe('people/staffbag-a');
    expect(floorSprite({ ...staff, carrying: true, mode: 'walk' }, 3)).toEqual({
      subject: 'people/staffbag-a',
      state: 'walk',
      frame: 1,
    });
  });
});
