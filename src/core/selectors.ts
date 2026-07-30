import { BUILDINGS } from '../data/buildings';
import { productionPerSecond } from './economy';
import { applyModifiers } from './modifiers';
import { totalSalaryPerSecond } from './staff';
import type { BuildingId, GameState, Modifier, ResourceId } from './types';

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

/** Total passive production/sec for a resource across every building, per current levels
 * and staffing. ECONOMY §3c (Sprint 11.5): the displayed Funding rate must be NET of
 * salary burn — the player was seeing gross production ("+20/s") while actually
 * receiving less ("+19/s") once salaries came out. `modifiers`/`now` (default `[]`/`0`,
 * same optional-tail pattern as resolveEconomyTick) let salary.rate/salary.flat
 * modifiers (Team culture, E-04) net out identically to how the real tick charges them;
 * omitting them nets against the unmodified salary cost, never the old un-netted gross. */
export function getResourceRatePerSecond(
  state: ProductionState,
  resource: ResourceId,
  modifiers: Modifier[] = [],
  now = 0,
): number {
  let total = 0;
  for (const def of Object.values(BUILDINGS)) {
    if (def.production?.resource !== resource) continue;
    const level = state.buildings[def.id].level;
    total += productionPerSecond(def.production.basePerSec, level, staffRatio(state, def.id));
  }
  if (resource === 'funding') {
    const salaryRateMult = applyModifiers(1, modifiers, 'salary.rate', now);
    const salaryFlatPerSecond = applyModifiers(0, modifiers, 'salary.flat', now);
    total -= totalSalaryPerSecond(state.staff) * salaryRateMult + salaryFlatPerSecond;
  }
  return total;
}
