import { describe, expect, it } from 'vitest';
import {
  AMBIENT_CALM_RELIEF,
  AMBIENT_DIRT_STRESS,
  AMBIENT_NOISE_STRESS,
  EVAL_DIRT,
  type TowerState,
} from '@tower-magnate/shared';
import { buildAmbient } from './ambient-stress';
import { unitScore } from './evaluation';

function stateWith(units: Record<string, unknown>): TowerState {
  return { units, people: { id: [], level: [], column: [], trip: [], kind: [] } } as never;
}

const fastFood = { id: 'u1', type: 'fast-food', level: 2, x: 40, venue: { garbage: 0 } };

describe('ambient stress', () => {
  it('adds stress near a noise source and nothing far from it', () => {
    const ambient = buildAmbient(stateWith({ u1: fastFood }));
    expect(ambient.walkDelta(2, 41)).toBe(AMBIENT_NOISE_STRESS);
    expect(ambient.walkDelta(2, 39)).toBe(AMBIENT_NOISE_STRESS);
    expect(ambient.walkDelta(3, 41)).toBeLessThanOrEqual(0);
  });

  it('gives a little back in a quiet clean spot, only on some columns', () => {
    const ambient = buildAmbient(stateWith({}));
    expect(ambient.walkDelta(5, 8)).toBe(-AMBIENT_CALM_RELIEF);
    expect(ambient.walkDelta(5, 9)).toBe(0);
  });

  it('adds stress near a garbage pile and stacks with noise', () => {
    const piled = { ...fastFood, venue: { garbage: 2 } };
    const ambient = buildAmbient(stateWith({ u1: piled }));
    const pile = 40 + Math.floor(16 * 0.75);
    expect(ambient.walkDelta(2, pile)).toBeGreaterThanOrEqual(AMBIENT_DIRT_STRESS);
    expect(ambient.walkDelta(2, pile + 20)).toBeLessThanOrEqual(0);
  });

  it('adds the dirt penalty to the unit score', () => {
    expect(unitScore(10, 1, false, 'office', true)).toBe(unitScore(10, 1, false, 'office') + EVAL_DIRT);
  });

  it('counts waiting beside noise or a bag per game minute', () => {
    const piled = { ...fastFood, venue: { garbage: 1 } };
    const ambient = buildAmbient(stateWith({ u1: piled }));
    const pile = 40 + Math.floor(16 * 0.75);
    expect(ambient.waitDelta(2, pile, 12)).toBe(2 * (1 + 2));
    expect(ambient.waitDelta(2, 200, 12)).toBe(0);
  });

  it('counts a stay per game hour, capped, and gives back when quiet and clean', () => {
    const ambient = buildAmbient(stateWith({ u1: fastFood }));
    expect(ambient.stayDelta(2, 41, 720)).toBe(8);
    expect(ambient.stayDelta(2, 41, 1_000_000)).toBe(48);
    expect(ambient.stayDelta(2, 200, 720)).toBe(-4);
  });
});
