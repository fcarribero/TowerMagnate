import type { PersonPool } from '@tower-magnate/shared';
import { cleanerWearsUniform, isCleaner } from './cleaning';
import { builderWearsUniform, isBuilder } from './construction';
import { doctorWearsUniform, isDoctor } from './doctors';
import { isMaid, maidTaskAt, maidWearsUniform } from './housekeeping';
import { isPhaseUniform, isPolice, policePhaseAt } from './police-phase';

/**
 * What the person wears: `uniform` for a police officer, maid, builder, cleaner or doctor in work clothes, otherwise
 * undefined for civilian clothes. Police, maids and an obrador's builders come in and go home in
 * civilian clothes and change inside their office, room or obrador; the crew from outside comes
 * in work clothes.
 */
export function outfitOf(pool: PersonPool, slot: number): 'uniform' | undefined {
  if (isPolice(pool, slot))
    return isPhaseUniform(policePhaseAt(pool, slot)) ? 'uniform' : undefined;
  if (isMaid(pool, slot)) return maidWearsUniform(maidTaskAt(pool, slot)) ? 'uniform' : undefined;
  if (isBuilder(pool, slot)) return builderWearsUniform(pool, slot) ? 'uniform' : undefined;
  if (isCleaner(pool, slot)) return cleanerWearsUniform(pool, slot) ? 'uniform' : undefined;
  if (isDoctor(pool, slot)) return doctorWearsUniform(pool, slot) ? 'uniform' : undefined;
  return undefined;
}
