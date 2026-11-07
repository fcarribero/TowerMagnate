import type { QueuedCommand, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { hashState } from './hash';
import { migrateState } from './migrations';
import { chance, nextInt } from './rng';
import { createTower } from './state';
import { createEngine } from './step';

const engine = createEngine({
  commandHandlers: {
    buildFloor(context, command) {
      if (command.x1 < command.x0) {
        return { ok: false, error: 'OUT_OF_BOUNDS' };
      }
      context.state.nextId += nextInt(context.state.rng, 1, 5);
      return { ok: true, cost: 0, refund: 0 };
    },
  },
  systems: [
    (context) => {
      if (chance(context.state.rng, 0.05)) {
        context.state.nextId += 1;
      }
    },
  ],
});

function floor(id: string, x0: number, x1: number): QueuedCommand {
  return { id, command: { type: 'buildFloor', level: 2, x0, x1 } };
}

function playSession(saveAndLoadAfterBatch?: number): string[] {
  let tower: TowerState = createTower(424242);
  const hashes: string[] = [];
  for (let batch = 0; batch < 20; batch++) {
    const result = engine.step(
      tower,
      [floor(`a${batch}`, 0, batch), floor(`b${batch}`, 5, 1)],
      997,
    );
    hashes.push(hashState(result));
    tower = result.state;
    if (batch === saveAndLoadAfterBatch) {
      tower = migrateState(JSON.parse(JSON.stringify(tower)));
    }
  }
  return hashes;
}

describe('saving and loading mid-session', () => {
  it('gives the same hashes as an uninterrupted session with the same seed and commands', () => {
    expect(playSession(9)).toEqual(playSession());
  });
});
