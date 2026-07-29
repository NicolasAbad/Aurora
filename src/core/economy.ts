import { BUILDINGS } from '../data/buildings';
import { buildingStaffRatio, totalSalaryPerSecond } from './staff';
import { creditHardware, currentHardwareTier } from './hardware';
import { applyModifiers } from './modifiers';
import type { BuildingState, GameState, Modifier, ResourceId, ResourceState, StaffState } from './types';

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
  buildings: GameState['buildings'];
  payrollUnpaid: boolean;
}

// ECONOMY §4b (v2.7): the starved indicator clears once a building has been fed for
// this many consecutive ms of simulated time (the doc's "3 consecutive [logical 1s]
// ticks", decoupled from how often this function happens to be called — a real-frame
// call and a 1-min offline chunk both just add their own deltaMs to the same streak).
const STARVATION_CLEAR_MS = 3000;

function updateStarvation(building: BuildingState, fed: boolean, deltaMs: number): BuildingState {
  if (!fed) {
    return { ...building, starvedIndicator: true, fedStreakMs: 0 };
  }
  const fedStreakMs = Math.min(building.fedStreakMs + deltaMs, STARVATION_CLEAR_MS);
  const starvedIndicator = fedStreakMs >= STARVATION_CLEAR_MS ? false : building.starvedIndicator;
  return { ...building, fedStreakMs, starvedIndicator };
}

// ECONOMY §4/§5 v3.6 (Sprint 8 economy unlock): two independent, stackable reductions to
// Materials-per-Hardware at Fabrication — QA station (an internal upgrade, checked
// directly by ownership, same pattern as Instrumentation × Test Stand leveling) and
// Aluminum alloys (a research node, going through the modifier registry like every other
// research effect, CLAUDE.md rule 4). Combined here since both bear on the same
// consumePerUnit figure; `modifiers`/`now` default to `[]`/`0` so every pre-v3.6 call
// site (no modifiers passed) gets exactly the old behavior (multiplier 1).
const QA_STATION_REDUCTION = 0.15;
// Exported: BuildingTile.tsx uses the same function to show the real effective
// consumption rate on Fabrication's tile (UI_SPEC §4's clarity rule — a rate the player
// can no longer verify by eye once an upgrade changes it stops counting as "stating the
// effect"), not just this module's own resolution path.
export function fabricationConsumeMultiplier(
  qaStationBought: boolean,
  modifiers: Modifier[],
  now: number,
): number {
  const base = applyModifiers(1, modifiers, 'fabrication.materialsPerHardware', now);
  return qaStationBought ? base * (1 - QA_STATION_REDUCTION) : base;
}

// Refinery's Recovery loop: -10% Materials per Propellant. No research-node source shares
// this target (unlike Fabrication's pair above), so no modifier registry involved.
const RECOVERY_LOOP_REDUCTION = 0.1;
export function refineryConsumeMultiplier(recoveryLoopBought: boolean): number {
  return recoveryLoopBought ? 1 - RECOVERY_LOOP_REDUCTION : 1;
}

// ECONOMY §4: Tracking Station "+25% Flight Experience per level from every flight" +
// Antenna Network internal upgrade "+25% Flight XP" (flat, on top). Building-level/
// upgrade-based, so — same precedent as certificationDurationMultiplier/
// fabricationConsumeMultiplier above — computed directly here rather than through
// core/modifiers.ts's registry (reserved for research/XP-tree effects). Stacks
// multiplicatively, same "linear per-level, stacks with the matching upgrade" pattern
// Test Stand/Instrumentation already established. Level 0 (unbuilt) correctly yields a
// 1x no-op multiplier (every pre-Sprint-10 flightxp grant already reads as if this
// existed and always returned 1).
export const TRACKING_STATION_XP_BONUS_PER_LEVEL = 0.25;
const ANTENNA_NETWORK_XP_MULT = 1.25;
export function trackingStationFlightXpMultiplier(level: number, antennaNetworkBought: boolean): number {
  const levelMult = 1 + TRACKING_STATION_XP_BONUS_PER_LEVEL * Math.max(0, level);
  return antennaNetworkBought ? levelMult * ANTENNA_NETWORK_XP_MULT : levelMult;
}

/**
 * Resolves a consumption-based producer (Fabrication, Refinery — ECONOMY §4b step 3):
 * claims its full tick's Materials requirement or produces nothing this tick (binary
 * starvation, "never negative production", same pattern as payroll insolvency but
 * per-building instead of global). An unstaffed/level-0 building has zero desired
 * output, which counts as trivially "fed" (not starved) — GDD's "staffing IS the
 * priority lever" note: nobody assigned means it isn't trying to claim anything, so it
 * shouldn't show as blocked. `consumeMultiplier` (default 1): see the two functions above.
 */
function resolveConsumer(
  buildingId: 'fabrication' | 'refinery',
  buildingState: BuildingState,
  staff: StaffState,
  materials: ResourceState,
  deltaSec: number,
  deltaMs: number,
  consumeMultiplier = 1,
): { buildingState: BuildingState; materials: ResourceState; producedAmount: number } {
  const def = BUILDINGS[buildingId];
  const ratio = buildingStaffRatio(staff, buildingId, buildingState.level);
  const desiredOutput =
    productionPerSecond(def.production!.basePerSec, buildingState.level, ratio) * deltaSec;
  const consumePerUnit = def.production!.consumes!.materials! * consumeMultiplier;
  const desiredConsume = desiredOutput * consumePerUnit;
  const fed = desiredOutput <= 0 || materials.amount >= desiredConsume;

  return {
    buildingState: updateStarvation(buildingState, fed, deltaMs),
    materials:
      fed && desiredConsume > 0
        ? { ...materials, amount: materials.amount - desiredConsume }
        : materials,
    producedAmount: fed ? desiredOutput : 0,
  };
}

/**
 * One tick's worth of economy resolution, in ECONOMY §4b's fixed order: (1) salaries —
 * GDD §1b, insolvency pauses ALL staffed production until salaries can be paid again,
 * no debt accumulating; (2) pure producers (Finance, Supply Depot, R&D Lab), subject to
 * caps; (3) consumers claim inputs in §4 table order (Fabrication, then Refinery),
 * each getting its full tick requirement or nothing — binary per-building starvation.
 *
 * `rateMultiplier` (default 1, the online rate) scales salaries and production —
 * ECONOMY §11: "resources and salaries at 60%" while offline. This is the one function
 * both the online game loop and core/offlineResolution.ts call, so offline genuinely
 * "reuses the exact same resolution logic as online" (CLAUDE.md rule 6), starvation
 * included (ECONOMY §4b: "offline resolution uses these exact same rules").
 *
 * `modifiers`/`now` (default `[]`/`0`, ECONOMY §4/§5 v3.6): consulted for Aluminum alloys'
 * Fabrication-consumption modifier, NARRATIVE §3 E-04's permanent `salary.flat` add, and
 * E-01 option B's temporary `production.rate` zero-out ("Halt Production 20 min") —
 * production only, salaries still deduct normally during a halt (the event says "halt
 * production," not "furlough staff"), so it scales a SEPARATE delta from salary's own.
 * Every pre-v3.6 call site that omits `modifiers`/`now` keeps the exact old behavior (no
 * modifiers means every query here is a no-op).
 */
export function resolveEconomyTick(
  resources: GameState['resources'],
  buildings: GameState['buildings'],
  staff: StaffState,
  completedTech: string[],
  deltaMs: number,
  rateMultiplier = 1,
  modifiers: Modifier[] = [],
  now = 0,
): EconomyTickResult {
  const deltaSec = (deltaMs / 1000) * rateMultiplier;
  const salaryFlatPerSecond = applyModifiers(0, modifiers, 'salary.flat', now);
  // ECONOMY §9 (Sprint 10): Team culture's -5% salaries registers on 'salary.rate' —
  // scales the per-hire total, not the flat add-on (E-04's premium is a fixed cost, not
  // a rate to discount).
  const salaryRateMult = applyModifiers(1, modifiers, 'salary.rate', now);
  const salaryCost = (totalSalaryPerSecond(staff) * salaryRateMult + salaryFlatPerSecond) * deltaSec;
  const canPaySalaries = resources.funding.amount >= salaryCost;

  if (!canPaySalaries) {
    return { resources, buildings, payrollUnpaid: true };
  }

  let funding = resources.funding;
  if (salaryCost > 0) {
    funding = { ...funding, amount: funding.amount - salaryCost };
  }

  const productionDeltaSec = deltaSec * applyModifiers(1, modifiers, 'production.rate', now);

  // --- Pure producers (§4b step 2) ---
  const financeAmount =
    productionPerSecond(
      BUILDINGS.finance.production!.basePerSec,
      buildings.finance.level,
      buildingStaffRatio(staff, 'finance', buildings.finance.level, buildings.finance.upgrades),
    ) * productionDeltaSec;
  funding = applyGrant(funding, financeAmount, false);

  const supplyDepotAmount =
    productionPerSecond(
      BUILDINGS.supplyDepot.production!.basePerSec,
      buildings.supplyDepot.level,
      buildingStaffRatio(staff, 'supplyDepot', buildings.supplyDepot.level, buildings.supplyDepot.upgrades),
    ) * productionDeltaSec;
  let materials = applyGrant(resources.materials, supplyDepotAmount, false);

  const rndAmount =
    productionPerSecond(
      BUILDINGS.rndLab.production!.basePerSec,
      buildings.rndLab.level,
      buildingStaffRatio(staff, 'rndLab', buildings.rndLab.level, buildings.rndLab.upgrades),
    ) * productionDeltaSec;
  const research = applyGrant(resources.research, rndAmount, false);

  // --- Consumers (§4b step 3): fixed order, Fabrication then Refinery ---
  const fabConsumeMult = fabricationConsumeMultiplier(
    buildings.fabrication.upgrades.includes('qaStation'),
    modifiers,
    now,
  );
  const fab = resolveConsumer(
    'fabrication',
    buildings.fabrication,
    staff,
    materials,
    productionDeltaSec,
    deltaMs,
    fabConsumeMult,
  );
  materials = fab.materials;
  const hardware = creditHardware(resources.hardware, fab.producedAmount, currentHardwareTier(completedTech));

  const refConsumeMult = refineryConsumeMultiplier(buildings.refinery.upgrades.includes('recoveryLoop'));
  const ref = resolveConsumer('refinery', buildings.refinery, staff, materials, productionDeltaSec, deltaMs, refConsumeMult);
  materials = ref.materials;
  const propellant = applyGrant(resources.propellant, ref.producedAmount, false);

  return {
    resources: { ...resources, funding, materials, research, hardware, propellant },
    buildings: { ...buildings, fabrication: fab.buildingState, refinery: ref.buildingState },
    payrollUnpaid: false,
  };
}
