import { BUILDINGS, BUILDING_IDS } from '../data/buildings';
import { productionPerSecond } from './economy';
import { applyModifiers } from './modifiers';
import { buildingStaffRatio, totalSalaryPerSecond } from './staff';
import type { BuildingId, BuildingState, GameState, Modifier, ResourceId } from './types';

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

/** Total built buildings right now — UI_SPEC §2h (Sprint 11.5, Site Map SECOND rework):
 * the ticker-area entry point's "count," same icon+count shape as the Constellation
 * View's. Lives here rather than in SiteMap.tsx (a pure derived value, not a component —
 * CLAUDE.md rule 3) so Ticker.tsx can use it without importing UI-tree code. */
export function builtBuildingCount(buildings: Record<BuildingId, BuildingState>): number {
  return BUILDING_IDS.filter((id) => buildings[id].level >= 1).length;
}

export type BuildingActivityState = 'active' | 'idle' | 'starved' | 'paused';

/**
 * UI_SPEC §2h (Sprint 11.6, THIRD reconception): the Site Map's actual reason to exist —
 * "which buildings I've built" was already visible on every complex tab (redundant, the
 * root cause the first two reworks never fixed); LIVE production/paused/starved state is
 * genuinely new information no single tab can show at once (each tab only ever shows its
 * own complex). Scoped deliberately to buildings that HAVE a production/consumption
 * concept (`def.production` — Finance, Supply Depot, R&D Lab, Fabrication, Refinery):
 * non-producer buildings (VAB, Launch Pad, Test Stand, Crew Quarters, ...) have no
 * "production rate" to report, so this returns null for them rather than inventing an
 * activity concept the docs never specified — the map falls back to their existing plain
 * built/unbuilt rendering, same as before this rework.
 * - `null`: not a producer, or not built yet.
 * - `'idle'`: built, but nobody's currently assigned — nothing to pause or starve.
 * - `'paused'`: GDD §1b insolvency — payroll unpaid, staffed production on hold. Checked
 *   BEFORE starvation since insolvency's "ALL staffed production pauses" (ECONOMY §4b
 *   item 1) is the outer gate the tick itself resolves first.
 * - `'starved'`: a consumer (Fabrication/Refinery) whose inputs ran out this tick,
 *   mirroring the same `starvedIndicator` BuildingTile.tsx already shows on the tile.
 * - `'active'`: staffed, funded, fed — genuinely producing right now.
 */
export function buildingActivityState(
  buildingId: BuildingId,
  state: Pick<GameState, 'buildings' | 'staff' | 'economyFlags'>,
): BuildingActivityState | null {
  const def = BUILDINGS[buildingId];
  if (!def.production) return null;
  const building = state.buildings[buildingId];
  if (building.level < 1) return null;

  const ratio = buildingStaffRatio(state.staff, buildingId, building.level, building.upgrades);
  if (ratio <= 0) return 'idle';
  if (state.economyFlags.payrollUnpaid) return 'paused';
  if (def.production.consumes && building.starvedIndicator) return 'starved';
  return 'active';
}
