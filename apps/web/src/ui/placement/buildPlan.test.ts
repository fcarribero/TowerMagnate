import { describe, expect, it } from 'vitest';
import {
  buildMode,
  commandForClick,
  commandForDrag,
  shaftCost,
  shaftIdAt,
  shaftMaxFloors,
  shaftSpan,
} from './buildPlan';
describe('buildMode', () => {
  it('drags floors and lobbies, clicks units and transport, ignores the rest', () => {
    expect(buildMode('floor')).toBe('drag');
    expect(buildMode('lobby')).toBe('drag');
    expect(buildMode('office')).toBe('click');
    expect(buildMode('stairs')).toBe('click');
    expect(buildMode('inspect')).toBe('none');
    expect(buildMode('bulldozer')).toBe('demolish');
    expect(buildMode('standard-elevator')).toBe('shaft');
    expect(buildMode('hand')).toBe('hand');
  });
});

describe('commandForClick', () => {
  it('builds a unit at the clicked cell', () => {
    expect(commandForClick('office', { x: 4, level: 3 })).toEqual({
      type: 'buildUnit',
      unitType: 'office',
      x: 4,
      level: 3,
    });
  });

  it('builds stairs and escalators as transport', () => {
    expect(commandForClick('escalator', { x: 10, level: 2 })).toEqual({
      type: 'buildTransport',
      transportType: 'escalator',
      x: 10,
      level: 2,
    });
  });

  it('sends nothing for a drag tool', () => {
    expect(commandForClick('floor', { x: 1, level: 2 })).toBeNull();
  });
});

describe('commandForDrag', () => {
  it('orders the end columns whichever way the drag went', () => {
    expect(commandForDrag('floor', 1, { x: 12, level: 5 }, 4)).toEqual({
      type: 'buildFloor',
      level: 5,
      x0: 4,
      x1: 12,
    });
  });

  it('carries the lobby height', () => {
    expect(commandForDrag('lobby', 2, { x: 3, level: 1 }, 9)).toEqual({
      type: 'buildLobby',
      level: 1,
      x0: 3,
      x1: 9,
      height: 2,
    });
  });
});

describe('shaft helpers', () => {
  it('spans levels bottom first without level 0', () => {
    expect(shaftSpan(5, 1)).toEqual({ bottom: 1, top: 5, floors: 5 });
    expect(shaftSpan(-1, 1)).toEqual({ bottom: -1, top: 1, floors: 2 });
  });

  it('knows the height limit and price of each shaft type', () => {
    expect(shaftMaxFloors('standard')).toBe(30);
    expect(shaftMaxFloors('express')).toBeNull();
    expect(shaftCost('standard')).toBe(280_000);
  });

  it('finds the shaft under a cell', () => {
    const shafts = [{ id: 's1', type: 'standard' as const, x: 10, bottom: 1, top: 9 }];
    expect(shaftIdAt(shafts, { x: 10, level: 9 })).toBe('s1');
    expect(shaftIdAt(shafts, { x: 9, level: 5 })).toBeNull();
    expect(shaftIdAt(shafts, { x: 10, level: 10 })).toBeNull();
    expect(shaftIdAt(undefined, { x: 10, level: 5 })).toBeNull();
  });
});
