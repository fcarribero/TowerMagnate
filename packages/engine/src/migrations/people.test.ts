import { describe, expect, it } from 'vitest';
import { addPerson, createPersonPool } from '../people';
import { createTower } from '../state';
import { migrateState, StateMigrationError } from './index';

describe('reading the person pool', () => {
  it('starts towers saved before people existed with an empty pool', () => {
    const saved: Record<string, unknown> = JSON.parse(JSON.stringify(createTower(1)));
    delete saved.people;
    expect(migrateState(saved).people).toEqual(createPersonPool());
  });

  it('loads a tower with nobody in it', () => {
    const saved = JSON.parse(JSON.stringify(createTower(1)));
    expect(migrateState(saved).people).toEqual(createPersonPool());
  });

  it('refuses a saved tower with people instead of dropping them', () => {
    const tower = createTower(1);
    addPerson(tower, { kind: 'resident', homeUnit: 0, level: 1, column: 0 });
    expect(() => migrateState(JSON.parse(JSON.stringify(tower)))).toThrow(StateMigrationError);
  });
});
