import type { Command, TowerState } from '@tower-magnate/shared';

function isListable(type: string): boolean {
  return type === 'condo' || type === 'office' || type === 'retail-shop';
}

/**
 * Commands that put every unlisted condo, office and shop (sites included) on the market. A new
 * unit starts unlisted, so scripted towers and bots send these to get tenants and buyers.
 */
export function listingCommands(state: TowerState): Command[] {
  const commands: Command[] = [];
  for (const site of Object.values(state.sites)) {
    if (isListable(site.type) && !site.listed) {
      commands.push({ type: 'setListed', unitId: site.id, listed: true });
    }
  }
  for (const unit of Object.values(state.units)) {
    if (isListable(unit.type) && !unit.listed && !unit.sale) {
      commands.push({ type: 'setListed', unitId: unit.id, listed: true });
    }
  }
  return commands;
}
