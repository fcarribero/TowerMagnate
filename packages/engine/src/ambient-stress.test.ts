import { describe, expect, it } from 'vitest';
import {
  AMBIENT_CALM_RELIEF,
  AMBIENT_DIRT_PER_MINUTE,
  AMBIENT_NOISE_PER_MINUTE,
  type TowerState,
} from '@tower-magnate/shared';
import { buildAmbient } from './ambient-stress';

function stateWith(units: Record<string, unknown>): TowerState {
  return { units, people: { id: [], level: [], column: [], trip: [], kind: [] } } as never;
}

const fastFood = { id: 'u1', type: 'fast-food', level: 2, x: 40, venue: { garbage: 0 } };
const pile = 40 + Math.floor(16 * 0.75);

describe('ambient stress', () => {
  it('adds stress each minute near a noise source and nothing far from it', () => {
    const ambient = buildAmbient(stateWith({ u1: fastFood }));
    expect(ambient.minuteDelta(2, 36, 7)).toBe(AMBIENT_NOISE_PER_MINUTE);
    expect(ambient.minuteDelta(2, 59, 7)).toBe(AMBIENT_NOISE_PER_MINUTE);
    expect(ambient.minuteDelta(3, 41, 7)).toBe(0);
  });

  it('gives a little back in a quiet clean cell, only every few minutes', () => {
    const ambient = buildAmbient(stateWith({}));
    expect(ambient.minuteDelta(5, 8, 10)).toBe(-AMBIENT_CALM_RELIEF);
    expect(ambient.minuteDelta(5, 8, 11)).toBe(0);
  });

  it('adds more near a garbage pile and stacks with noise', () => {
    const ambient = buildAmbient(stateWith({ u1: { ...fastFood, venue: { garbage: 2 } } }));
    expect(ambient.minuteDelta(2, pile, 7)).toBe(AMBIENT_NOISE_PER_MINUTE + AMBIENT_DIRT_PER_MINUTE);
    expect(ambient.minuteDelta(2, pile + 20, 7)).toBe(0);
  });

  it('knows which cells are inside a unit', () => {
    const ambient = buildAmbient(stateWith({ u1: fastFood }));
    expect(ambient.insideUnit(2, 40)).toBe(true);
    expect(ambient.insideUnit(2, 56)).toBe(false);
    expect(ambient.insideUnit(3, 45)).toBe(false);
  });

  it('counts a stay by its minutes, capped, and gives back when quiet and clean', () => {
    const ambient = buildAmbient(stateWith({ u1: fastFood }));
    expect(ambient.stayDelta(2, 41, 60)).toBe(10 * AMBIENT_NOISE_PER_MINUTE);
    expect(ambient.stayDelta(2, 41, 1_000_000)).toBe(120 * AMBIENT_NOISE_PER_MINUTE);
    expect(ambient.stayDelta(2, 200, 300)).toBe(-10 * AMBIENT_CALM_RELIEF);
  });
});
