import { UNIT_TYPES, type ConstructionSite } from '@tower-magnate/shared';
import { isRecord, StateMigrationError } from './errors';

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

/** Version 37 keeps the units still being built apart from the finished ones. */
export function readSites(raw: unknown): Record<string, ConstructionSite> {
  if (!isRecord(raw)) {
    throw new StateMigrationError('State sites must be a record of construction sites');
  }
  const sites: Record<string, ConstructionSite> = {};
  for (const [id, site] of Object.entries(raw)) {
    const valid =
      isRecord(site) &&
      site.id === id &&
      typeof site.type === 'string' &&
      (UNIT_TYPES as readonly string[]).includes(site.type) &&
      Number.isInteger(site.x) &&
      Number.isInteger(site.level) &&
      isNonNegativeInteger(site.paid) &&
      isNonNegativeInteger(site.placedAtStep) &&
      isNonNegativeInteger(site.points);
    if (!valid) {
      throw new StateMigrationError(`Site ${id} is not a valid construction site`);
    }
    sites[id] = { ...(site as unknown as ConstructionSite) };
  }
  return sites;
}
