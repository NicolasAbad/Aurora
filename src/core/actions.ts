// Pure resolvers for discrete player actions (as opposed to core/tick.ts's continuous
// per-frame resolution). Each returns the updated state slice on success, or `null` if
// the action isn't currently valid — callers (the store) simply no-op on `null`.
import { BUILDINGS } from '../data/buildings';
import { CERTIFICATION_TESTS_BY_ID } from '../data/certifications';
import { PROMOTIONS } from '../data/roles';
import { RESEARCH_BY_ID, repeatableNodeCost } from '../data/researchTree';
import {
  buildingSlotCount,
  hiringCost,
  isRoleUnlocked,
  promotionCost,
  promotionDurationMs,
  totalHired,
  totalStaffCap,
  unassignedCount,
} from './staff';
import {
  certificationDurationMultiplier,
  isCertificationTestAvailable,
  type CertificationState,
} from './certification';
import { applyGrant, costAtLevel, pitchYield } from './economy';
import { hardwareAtOrAboveTier, spendHardware } from './hardware';
import { applyModifiers } from './modifiers';
import { isNodeAvailable, type ResearchState } from './research';
import type {
  BuildingId,
  GameState,
  HardwareTier,
  Modifier,
  Process,
  ResourceId,
  ResourceState,
  RoleId,
  StaffState,
} from './types';

// `minHardwareTier` (CLAUDE.md schema: "Costs may demand a minimum tier") gates the
// `hardware` entry of a cost specifically — no current Sprint 0-3 building sets it, but
// the check/deduction machinery exists now so a later sprint's tier-gated cost (e.g. a
// tier-2 contract requiring Titanium) just works without touching this again.
export function canAffordCost(
  resources: GameState['resources'],
  cost: Partial<Record<ResourceId, number>>,
  minHardwareTier?: HardwareTier,
): boolean {
  return (Object.entries(cost) as [ResourceId, number][]).every(([id, amount]) => {
    if (id === 'hardware' && minHardwareTier) {
      return hardwareAtOrAboveTier(resources.hardware, minHardwareTier) >= amount;
    }
    return resources[id].amount >= amount;
  });
}

// Typed as the common ResourceState base (not GameState['resources']) while mutating,
// since TS can't prove a generic ResourceId key stays within HardwareState's extra
// `byTier` requirement — safe here because these helpers only ever touch the fields
// ResourceState and HardwareState share (amount/cap/lifetimeEarned), never byTier,
// EXCEPT hardware, which goes through spendHardware to keep sum(byTier) === amount.
export function payCost(
  resources: GameState['resources'],
  cost: Partial<Record<ResourceId, number>>,
  minHardwareTier?: HardwareTier,
): GameState['resources'] {
  const next: Record<ResourceId, ResourceState> = { ...resources };
  for (const [id, amount] of Object.entries(cost) as [ResourceId, number][]) {
    if (id === 'hardware') {
      next.hardware = spendHardware(resources.hardware, amount, minHardwareTier);
    } else {
      next[id] = { ...next[id], amount: next[id].amount - amount };
    }
  }
  return next as GameState['resources'];
}

/** ECONOMY §2: manual pitch — a one-time Funding grant, ignores the Funding cap (§1c). */
export function applyPitch(
  resources: GameState['resources'],
  officesLevel: number,
): GameState['resources'] {
  return { ...resources, funding: applyGrant(resources.funding, pitchYield(officesLevel), true) };
}

const GATHER_MATERIALS_YIELD = 5; // ECONOMY §2
const RUSH_ORDER_MATERIALS = 100; // ECONOMY §2
const RUSH_ORDER_COST_FUNDING = 150; // ECONOMY §2

/** ECONOMY §2: manual gather — free, one-time Materials grant. Cooldown is UI-only
 * (PitchButton's established pattern); unlocked once Supply Depot is built (lv1+). */
export function applyGatherMaterials(
  resources: GameState['resources'],
  supplyDepotLevel: number,
): GameState['resources'] | null {
  if (supplyDepotLevel < 1) return null;
  return { ...resources, materials: applyGrant(resources.materials, GATHER_MATERIALS_YIELD, true) };
}

/** ECONOMY §2 / GDD §3: Rush Order — pitch's Materials-side counterpart, an instant
 * Funding-for-Materials trade for impatient moments. Unlocked once Fabrication is built. */
export function applyRushOrder(
  resources: GameState['resources'],
  fabricationLevel: number,
): GameState['resources'] | null {
  if (fabricationLevel < 1) return null;
  if (resources.funding.amount < RUSH_ORDER_COST_FUNDING) return null;
  return {
    ...resources,
    funding: { ...resources.funding, amount: resources.funding.amount - RUSH_ORDER_COST_FUNDING },
    materials: applyGrant(resources.materials, RUSH_ORDER_MATERIALS, true),
  };
}

export interface BuyBuildingResult {
  resources: GameState['resources'];
  buildings: GameState['buildings'];
}

// ECONOMY §4 v3.6: Warehouse's Inventory system multiplies every FUTURE level's cap
// bonus by 1.25x — never retroactive to levels already bought, same "computed at the
// moment, not retroactive" precedent as Sprint 7.5's Auto-refuel/Test-Stand leveling.
// Generic lookup (rule 3): any future cap-bonus-scaling upgrade just adds a row here.
const CAP_BONUS_UPGRADE_MULT: Partial<Record<string, number>> = {
  inventorySystem: 1.25,
};

// Exported: upgradePreview.ts uses the same lookup so the "next level" preview matches
// what buyBuildingUpgrade will actually grant, rather than a second guess at the number.
export function capBonusMultiplier(upgrades: string[]): number {
  return upgrades.reduce((mult, id) => mult * (CAP_BONUS_UPGRADE_MULT[id] ?? 1), 1);
}

/** Buys the next level of `buildingId` (or builds a one-time building) if affordable. */
export function buyBuildingUpgrade(
  resources: GameState['resources'],
  buildings: GameState['buildings'],
  buildingId: BuildingId,
): BuyBuildingResult | null {
  const def = BUILDINGS[buildingId];
  const current = buildings[buildingId];
  if (def.costFactor === null && current.level > 0) return null; // one-time, already built

  const cost = costAtLevel(def.baseCost, def.costFactor, current.level, def.costThresholds);
  if (!canAffordCost(resources, cost, def.minHardwareTier)) return null;

  let nextResources: Record<ResourceId, ResourceState> = payCost(resources, cost, def.minHardwareTier);
  if (def.capBonus) {
    const capMult = capBonusMultiplier(current.upgrades);
    for (const [id, amount] of Object.entries(def.capBonus) as [ResourceId, number][]) {
      const resource = nextResources[id];
      nextResources = {
        ...nextResources,
        [id]: { ...resource, cap: (resource.cap ?? 0) + amount * capMult },
      };
    }
  }

  return {
    resources: nextResources as GameState['resources'],
    buildings: {
      ...buildings,
      [buildingId]: { ...current, level: def.costFactor === null ? 1 : current.level + 1 },
    },
  };
}

/** Buys a one-time internal upgrade (e.g. Crew Quarters' Classroom/Cafeteria) if not
 * already owned and affordable. Generic across every BuildingDef.internalUpgrades
 * entry — not special-cased per building (rule 3: systems are generic, content is data). */
export function buyInternalUpgrade(
  resources: GameState['resources'],
  buildings: GameState['buildings'],
  buildingId: BuildingId,
  upgradeId: string,
): BuyBuildingResult | null {
  const current = buildings[buildingId];
  if (current.upgrades.includes(upgradeId)) return null;
  const upgrade = BUILDINGS[buildingId].internalUpgrades?.find((u) => u.id === upgradeId);
  if (!upgrade) return null;
  if (!canAffordCost(resources, upgrade.cost, upgrade.minHardwareTier)) return null;

  return {
    resources: payCost(resources, upgrade.cost, upgrade.minHardwareTier),
    buildings: {
      ...buildings,
      [buildingId]: { ...current, upgrades: [...current.upgrades, upgradeId] },
    },
  };
}

export interface HireStaffResult {
  resources: GameState['resources'];
  staff: StaffState;
}

/** Hires one more `role`, per ECONOMY §3 — tech-gated, staff-cap-gated, cost-gated.
 * `modifiers`/`now` (default `[]`/`0`, ECONOMY §9 Sprint 10): Recruiting's -15% hiring
 * cost — see core/staff.ts's hiringCost. */
export function hireStaff(
  resources: GameState['resources'],
  staff: StaffState,
  completedTech: string[],
  crewQuartersLevel: number,
  role: RoleId,
  modifiers: Modifier[] = [],
  now = 0,
): HireStaffResult | null {
  if (!isRoleUnlocked(role, completedTech)) return null;
  if (totalHired(staff) >= totalStaffCap(crewQuartersLevel)) return null;

  const cost = hiringCost(role, staff.pools[role].hired, modifiers, now);
  if (resources.funding.amount < cost) return null;

  return {
    resources: payCost(resources, { funding: cost }),
    staff: {
      ...staff,
      pools: {
        ...staff.pools,
        [role]: { ...staff.pools[role], hired: staff.pools[role].hired + 1 },
      },
    },
  };
}

/**
 * Adjusts how many `role` are assigned to `buildingId` by `delta` (+1/-1 from a UI
 * stepper). Refuses to assign past the building's slot count or past how many of that
 * role are actually hired-and-unassigned; refuses to unassign below zero. `buildingLevel`
 * gates ECONOMY §4 (v2.8): slots exist only at level >= 1, so an unbuilt building always
 * refuses assignment (buildingSlotCount returns 0) — hiring into the pool with no
 * building yet is still a legitimate, unrestricted choice (that's `hireStaff`, untouched).
 * `upgrades` (default none, ECONOMY §4 v3.6): owned slot-adding internal upgrades for
 * this building — see core/staff.ts's buildingSlotCount.
 */
export function adjustStaffAssignment(
  staff: StaffState,
  role: RoleId,
  buildingId: BuildingId,
  delta: number,
  buildingLevel: number,
  upgrades: string[] = [],
): StaffState | null {
  if (delta === 0) return null;
  const pool = staff.pools[role];
  const nextAssigned = (pool.assigned[buildingId] ?? 0) + delta;
  if (nextAssigned < 0) return null;

  if (delta > 0) {
    if (nextAssigned > buildingSlotCount(buildingId, role, buildingLevel, upgrades)) return null;
    if (unassignedCount(staff, role) < delta) return null;
  }

  return {
    ...staff,
    pools: {
      ...staff.pools,
      [role]: { ...pool, assigned: { ...pool.assigned, [buildingId]: nextAssigned } },
    },
  };
}

/**
 * UI_SPEC §4b (Sprint 7.5, new capability): releases one hired unit of `role`. No refund
 * of hiring cost — the real cost of a hiring mistake, same philosophy as insolvency
 * being self-inflicted-but-recoverable. Salary stops the instant of release with no
 * extra bookkeeping: `totalSalaryPerSecond` reads `pool.hired` directly, so the very
 * next tick's cost is already lower. Unassigns first if every hired unit of this role
 * happens to be currently assigned somewhere — pool members have no individual identity
 * in v1 (unlike Astronaut), so which specific assignment frees is arbitrary; picks the
 * first building with a nonzero count. No-op if nothing of this role is hired.
 */
export function releaseStaff(staff: StaffState, role: RoleId): StaffState | null {
  const pool = staff.pools[role];
  if (pool.hired < 1) return null;

  let assigned = pool.assigned;
  if (unassignedCount(staff, role) < 1) {
    const buildingId = (Object.keys(assigned) as BuildingId[]).find((id) => (assigned[id] ?? 0) > 0);
    if (buildingId) {
      assigned = { ...assigned, [buildingId]: assigned[buildingId] - 1 };
    }
  }

  return {
    ...staff,
    pools: { ...staff.pools, [role]: { hired: pool.hired - 1, assigned } },
  };
}

export interface StartResearchResult {
  resources: GameState['resources'];
  research: ResearchState;
}

/** Starts `nodeId` if it's available (deps met, not already done), nothing else is
 * already in progress ("one node at a time in v1"), and Research covers its cost —
 * paid upfront, same pattern as every other timed process in this codebase. */
/**
 * `secondTrackUnlocked` (default false, ECONOMY §4 v3.6): R&D Lab's "Second research
 * track" internal upgrade — once owned, a node can start into a second, independent slot
 * while the first is still running, rather than being refused outright. Primary slot is
 * always filled first; the second slot is never used while the first is empty, so a
 * player without the upgrade sees no behavior change at all.
 */
/** ECONOMY §5b v4.1 (Sprint 11.5): the level lookup isNodeAvailable's buildingDep check
 * needs, derived from the real per-building state — a one-liner, not its own module,
 * shared by this file's startResearch and ui/ResearchPanel.tsx so both gate identically. */
export function buildingLevelsFor(buildings: GameState['buildings']): Partial<Record<BuildingId, number>> {
  return Object.fromEntries(
    (Object.entries(buildings) as [BuildingId, GameState['buildings'][BuildingId]][]).map(([id, b]) => [id, b.level]),
  );
}

export function startResearch(
  resources: GameState['resources'],
  research: ResearchState,
  nodeId: string,
  now: number,
  secondTrackUnlocked = false,
  modifiers: Modifier[] = [],
  buildings?: GameState['buildings'],
): StartResearchResult | null {
  const node = RESEARCH_BY_ID.get(nodeId);
  const buildingLevels = buildings ? buildingLevelsFor(buildings) : {};
  const repeatablePurchases = research.repeatablePurchases ?? {};
  if (!node || !isNodeAvailable(node, research.completed, buildingLevels, repeatablePurchases)) return null;
  // ECONOMY §5b v4.1: Funding/Materials alongside Research, for the subset of nodes that
  // declare `secondaryCost` — reuses the same canAffordCost/payCost every other cost in
  // this file goes through, merged with the Research cost into one object.
  // ECONOMY §5c v4.3 (Sprint 11.6): a repeatable node's cost escalates by its own prior
  // purchase count instead of the flat `costR`/`secondaryCost` every other node uses.
  const cost = node.repeatable
    ? repeatableNodeCost(node, repeatablePurchases[nodeId] ?? 0)
    : { research: node.costR, ...node.secondaryCost };
  if (!canAffordCost(resources, cost)) return null;

  let targetSlot: 'inProgress' | 'secondInProgress';
  if (!research.inProgress) {
    targetSlot = 'inProgress';
  } else if (secondTrackUnlocked && !research.secondInProgress) {
    targetSlot = 'secondInProgress';
  } else {
    return null;
  }

  // NARRATIVE §3 E-05: temporary +10% process-duration modifier (default [] keeps every
  // pre-Sprint-9 call site's exact old behavior).
  const process: Process = {
    id: `research-${nodeId}`,
    kind: 'research',
    startedAt: now,
    durationMs: applyModifiers(node.durationMs, modifiers, 'process.duration', now),
    payload: { nodeId },
  };

  return {
    resources: payCost(resources, cost),
    research: { ...research, [targetSlot]: process },
  };
}

export interface StartCertificationResult {
  resources: GameState['resources'];
  certifications: CertificationState;
}

/** ECONOMY §6: starts `testId` if it's currently available for its engine (sequencing
 * per core/certification.ts's isCertificationTestAvailable), nothing else is already
 * testing ("one test at a time", same pattern as research), and Hardware+Propellant
 * cover its cost — paid upfront, same as every other timed process here. Duration is
 * scaled by Test Stand's level + Instrumentation (ECONOMY §4 v3.5, Sprint 7.5 SCOPED
 * UNLOCK) — computed once at start, not re-derived at resolution, same "commit at the
 * decisive moment" spirit as the roll below (a later Test Stand upgrade mid-test must
 * not retroactively speed up an already-running test). */
export function startCertification(
  resources: GameState['resources'],
  certifications: CertificationState,
  testId: string,
  testStandLevel: number,
  instrumentationBought: boolean,
  now: number,
  randomFn: () => number = Math.random,
  modifiers: Modifier[] = [],
): StartCertificationResult | null {
  if (certifications.inProgress) return null;
  const test = CERTIFICATION_TESTS_BY_ID.get(testId);
  if (!test) return null;
  if (!isCertificationTestAvailable(test, certifications.engines[test.engineId])) return null;
  if (!canAffordCost(resources, test.consumes)) return null;

  const payload: Record<string, unknown> = { testId };
  if (test.successRate !== undefined) {
    // Rule 12: drawn once, here, at START — never redrawn at resolution
    // (core/certification.ts reads this same stored value).
    payload.committedRoll = randomFn();
  }

  // NARRATIVE §3 E-05: temporary +10% process-duration modifier, stacked with Test
  // Stand/Instrumentation's existing reduction (default [] keeps every pre-Sprint-9 call
  // site's exact old behavior). ECONOMY §9 (Sprint 10): Optimized ignition's -20%
  // registers on 'certification.duration' specifically — applied before the generic
  // 'process.duration' bucket, same two-step stacking as auroraMission.ts's
  // 'transfer.duration' -> 'process.duration' pattern.
  const durationMs = applyModifiers(
    applyModifiers(
      test.durationMs * certificationDurationMultiplier(testStandLevel, instrumentationBought),
      modifiers,
      'certification.duration',
      now,
    ),
    modifiers,
    'process.duration',
    now,
  );

  return {
    resources: payCost(resources, test.consumes),
    certifications: {
      ...certifications,
      inProgress: {
        id: `certification-${testId}-${now}`,
        kind: 'certification',
        startedAt: now,
        durationMs,
        payload,
      },
    },
  };
}

export interface StartPromotionResult {
  resources: GameState['resources'];
  staff: StaffState;
  processes: Process[];
}

/**
 * ECONOMY §3: promotion is gated ONLY by the Classroom being built, never by the
 * target role's direct-hire tech (the intended zero-Scientist bootstrap path — do not
 * add a tech gate here). Requires an UNASSIGNED unit of `from` (never touches
 * assignment records to free one up itself). The promoted unit leaves the `from` pool
 * immediately (paid, "in training") and only joins `to` on completion — see the
 * process-completion dispatcher in persistStore.ts, the analogous pay-now/grant-later
 * pattern every other timed process here already uses.
 */
export function startPromotion(
  resources: GameState['resources'],
  staff: StaffState,
  processes: Process[],
  classroomBuilt: boolean,
  from: RoleId,
  to: RoleId,
  now: number,
  modifiers: Modifier[] = [],
): StartPromotionResult | null {
  if (!classroomBuilt) return null;
  const def = PROMOTIONS.find((p) => p.from === from && p.to === to);
  if (!def) return null;
  if (unassignedCount(staff, from) < 1) return null;

  // ECONOMY §5 v4.1: basicEngineering/scientificMethod's -25% promotion accelerator
  // (see core/staff.ts's promotionCost/promotionDurationMs) applies before the generic
  // E-05 process-duration modifier below — same two-step stacking as
  // startCertification's certification.duration -> process.duration.
  const cost = promotionCost(def, modifiers, now);
  if (resources.funding.amount < cost) return null;

  return {
    resources: payCost(resources, { funding: cost }),
    staff: {
      ...staff,
      pools: {
        ...staff.pools,
        [from]: { ...staff.pools[from], hired: staff.pools[from].hired - 1 },
      },
    },
    processes: [
      ...processes,
      {
        id: `promotion-${from}-${to}-${now}`,
        kind: 'training',
        startedAt: now,
        durationMs: applyModifiers(promotionDurationMs(def, modifiers, now), modifiers, 'process.duration', now),
        payload: { from, to },
      },
    ],
  };
}

/**
 * Applies whatever effect a just-finished generic process (`Process[]`, as opposed to
 * research's own dedicated slot) grants — the dispatcher Sprint 2/3 deliberately left
 * unbuilt ("no process kind has a defined payload yet"). Sprint 4 gives 'training'
 * (promotion) its real effect: the promoted unit joins `to`'s pool, unassigned, exactly
 * like a fresh hire. Other kinds (certification, integration, transfer, contract_build,
 * weather_window) have no defined payload yet and are ignored here — each is this
 * dispatcher's job to extend once whichever sprint defines its payload/effect.
 */
export function applyCompletedProcesses(staff: StaffState, completed: Process[]): StaffState {
  return completed.reduce((nextStaff, process) => {
    if (process.kind !== 'training') return nextStaff;
    const { to } = process.payload as { from: RoleId; to: RoleId };
    return {
      ...nextStaff,
      pools: { ...nextStaff.pools, [to]: { ...nextStaff.pools[to], hired: nextStaff.pools[to].hired + 1 } },
    };
  }, staff);
}
