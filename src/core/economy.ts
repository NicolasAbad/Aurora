import { BUILDINGS } from '../data/buildings';
import { staffRatioForBuilding, totalSalaryPerSecond } from './staff';
import type { GameState, ResourceId, ResourceState, StaffState } from './types';

/**
 * Cost to go from `level` to `level + 1`, per ECONOMY_MODEL §4 (`base × factor^level`).
 * `level` is the CURRENT level (0 for an unbuilt building's first purchase).
 * `factor: null` marks a one-time building (Launch Rail, Launch Pad B) — cost is just baseCost.
 * Costs are rounded up so a building is never cheaper than its documented value.
 */
export function costAtLevel(
  baseCost: Partial<Record<ResourceId, number>>,
  factor: number | null,
  level: number,
): Partial<Record<ResourceId, number>> {
  const scale = factor === null ? 1 : factor ** level;
  const scaled: Partial<Record<ResourceId, number>> = {};
  for (const [resource, amount] of Object.entries(baseCost) as [ResourceId, number][]) {
    scaled[resource] = Math.ceil(amount * scale);
  }
  return scaled;
}

/**
 * Passive production/sec, per ECONOMY_MODEL §4 (`base × level × staffRatio`).
 * `staffRatio` is filled/total slots for the building, clamped to [0, 1].
 */
export function productionPerSecond(
  basePerSec: number,
  level: number,
  staffRatio: number,
): number {
  const ratio = Math.max(0, Math.min(1, staffRatio));
  return basePerSec * level * ratio;
}

/**
 * Manual pitch yield, per ECONOMY_MODEL §2 — the single authoritative formula
 * (§4's Offices row is a reference to this, not a second formula).
 */
export function pitchYield(officesLevel: number): number {
  return 10 + 5 * (officesLevel - 1);
}

/**
 * Grant `amount` of a resource. Passive/continuous production (`oneTime: false`) halts
 * at cap — GDD §1c — crediting only the room left, never more. One-time payments
 * (`oneTime: true`) ignore the cap entirely, per the same rule. `lifetimeEarned` tracks
 * what was actually credited (production that halts at cap was never really produced,
 * per §1c's wording — there's no "wasted" excess to still count).
 */
export function applyGrant(resource: ResourceState, amount: number, oneTime: boolean): ResourceState {
  if (amount <= 0) return resource;
  const room = oneTime || resource.cap === null ? amount : Math.max(0, resource.cap - resource.amount);
  const added = Math.min(amount, room);
  if (added <= 0) return resource;
  return {
    ...resource,
    amount: resource.amount + added,
    lifetimeEarned: resource.lifetimeEarned + added,
  };
}

export interface EconomyTickResult {
  resources: GameState['resources'];
  payrollUnpaid: boolean;
}

/**
 * One tick's worth of economy resolution: salaries first, then passive production —
 * GDD §1b, insolvency pauses ALL staffed production until salaries can be paid again,
 * with no debt accumulating (an unaffordable tick simply doesn't deduct). Sprint-1 scope
 * covers Campus's two producers (Finance -> Funding, R&D Lab -> Research); Sprint 3 adds
 * Complex B's consumption-based producers (Fabrication/Refinery) as their own path since
 * "input-starved, never negative" is a materially different problem from these two.
 *
 * `rateMultiplier` (default 1, the online rate) scales BOTH salaries and production —
 * ECONOMY §11: "resources and salaries at 60%" while offline. This is the one function
 * both the online game loop and core/offlineResolution.ts call, so offline genuinely
 * "reuses the exact same resolution logic as online" (CLAUDE.md rule 6) rather than
 * approximating it.
 */
export function resolveEconomyTick(
  resources: GameState['resources'],
  buildings: GameState['buildings'],
  staff: StaffState,
  deltaMs: number,
  rateMultiplier = 1,
): EconomyTickResult {
  const deltaSec = (deltaMs / 1000) * rateMultiplier;
  const salaryCost = totalSalaryPerSecond(staff) * deltaSec;
  const canPaySalaries = resources.funding.amount >= salaryCost;

  if (!canPaySalaries) {
    return { resources, payrollUnpaid: true };
  }

  let funding = resources.funding;
  if (salaryCost > 0) {
    funding = { ...funding, amount: funding.amount - salaryCost };
  }

  const financeAmount =
    productionPerSecond(
      BUILDINGS.finance.production!.basePerSec,
      buildings.finance.level,
      staffRatioForBuilding(staff, 'finance', 'technician'),
    ) * deltaSec;
  funding = applyGrant(funding, financeAmount, false);

  const rndAmount =
    productionPerSecond(
      BUILDINGS.rndLab.production!.basePerSec,
      buildings.rndLab.level,
      staffRatioForBuilding(staff, 'rndLab', 'scientist'),
    ) * deltaSec;
  const research = applyGrant(resources.research, rndAmount, false);

  return {
    resources: { ...resources, funding, research },
    payrollUnpaid: false,
  };
}
