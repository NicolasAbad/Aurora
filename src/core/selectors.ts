import { BUILDINGS } from '../data/buildings';
import { productionPerSecond } from './economy';
import type { BuildingId, GameState, ResourceId } from './types';

// Narrowed to what these selectors actually read, so callers (e.g. Ticker) can
// subscribe to just `buildings` + `staff` instead of the whole store (rule 10).
type ProductionState = Pick<GameState, 'buildings' | 'staff'>;

function staffRatio(state: ProductionState, buildingId: BuildingId): number {
  const slots = BUILDINGS[buildingId].slots;
  if (!slots) return 1;

  const required = Object.values(slots).reduce((sum: number, n) => sum + (n ?? 0), 0);
  if (required === 0) return 1;

  const roles = Object.keys(slots) as (keyof typeof slots)[];
  const assigned = roles.reduce(
    (sum, role) => sum + (state.staff.pools[role].assigned[buildingId] ?? 0),
    0,
  );
  return assigned / required;
}

/** Total passive production/sec for a resource across every building, per current levels and staffing. */
export function getResourceRatePerSecond(state: ProductionState, resource: ResourceId): number {
  let total = 0;
  for (const def of Object.values(BUILDINGS)) {
    if (def.production?.resource !== resource) continue;
    const level = state.buildings[def.id].level;
    total += productionPerSecond(def.production.basePerSec, level, staffRatio(state, def.id));
  }
  return total;
}
