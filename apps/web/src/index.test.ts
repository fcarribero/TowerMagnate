import { describe, expect, it } from 'vitest';
import { pageTitle } from './index';

describe('pageTitle', () => {
  it('shows only the game title when the tower has no name', () => {
    expect(pageTitle()).toBe('Tower Magnate');
    expect(pageTitle('   ')).toBe('Tower Magnate');
  });

  it('puts the tower name before the game title', () => {
    expect(pageTitle('Torre Sur')).toBe('Torre Sur - Tower Magnate');
  });
});
