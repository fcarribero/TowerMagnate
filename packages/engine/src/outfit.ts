import type { PersonPool } from '@tower-magnate/shared';
import { isMaid, maidTaskAt, maidWearsUniform } from './housekeeping';
import { isPhaseUniform, isPolice, policePhaseAt } from './police-phase';

/**
 * What the person wears: `uniform` for a police officer or maid in work clothes, otherwise
 * undefined for civilian clothes. Police and maids come in and go home in civilian clothes and
 * change inside their office or room.
 */
export function outfitOf(pool: PersonPool, slot: number): 'uniform' | undefined {
  if (isPolice(pool, slot)) return isPhaseUniform(policePhaseAt(pool, slot)) ? 'uniform' : undefined;
  if (isMaid(pool, slot)) return maidWearsUniform(maidTaskAt(pool, slot)) ? 'uniform' : undefined;
  return undefined;
}
