import { OFFICE_POPULATION, type TowerState } from '@tower-magnate/shared';

export interface PopulationBreakdown {
  offices: number;
  total: number;
}

function officePopulation(state: TowerState): number {
  let leased = 0;
  for (const unit of Object.values(state.units)) {
    if (unit.type === 'office' && unit.lease) {
      leased += 1;
    }
  }
  return leased * OFFICE_POPULATION;
}

/** Population at the current step, computed from the tower's state (stars.md 3). */
export function populationOf(state: TowerState): PopulationBreakdown {
  const offices = officePopulation(state);
  return { offices, total: offices };
}
