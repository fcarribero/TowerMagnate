import type { TowerState, Unit } from '@tower-magnate/shared';

/** The highest level of one upgrade among the tower's security offices, 0 with none. */
export function bestSecurityUpgrade(state: TowerState, upgrade: string): number {
  let best = 0;
  for (const id in state.units) {
    const unit = state.units[id as keyof typeof state.units] as Unit;
    if (unit.type !== 'security') continue;
    const level = unit.upgrades?.[upgrade] ?? 0;
    if (level > best) best = level;
  }
  return best;
}
