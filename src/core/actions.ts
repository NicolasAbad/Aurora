// Pure resolvers for discrete player actions (as opposed to core/tick.ts's continuous
// per-frame resolution). Each returns the updated state slice on success, or `null` if
// the action isn't currently valid — callers (the store) simply no-op on `null`.
import { BUILDINGS } from '../data/buildings';
import {
  buildingSlotCount,
  hiringCost,
  isRoleUnlocked,
  totalHired,
  totalStaffCap,
  unassignedCount,
} from './staff';
import { applyGrant, costAtLevel, pitchYield } from './economy';
import { hardwareAtOrAboveTier, spendHardware } from './hardware';
import type {
  BuildingId,
  GameState,
  HardwareTier,
  ResourceId,
  ResourceState,
  RoleId,
  StaffState,
} from './types';

// `minHardwareTier` (CLAUDE.md schema: "Costs may demand a minimum tier") gates the
// `hardware` entry of a cost specifically — no current Sprint 0-3 building sets it, but
// the check/deduction machinery exists now so a later sprint's tier-gated cost (e.g. a
// tier-2 contract requiring Titanium) just works without touching this again.
function canAffordCost(
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
function payCost(
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

/** Buys the next level of `buildingId` (or builds a one-time building) if affordable. */
export function buyBuildingUpgrade(
  resources: GameState['resources'],
  buildings: GameState['buildings'],
  buildingId: BuildingId,
): BuyBuildingResult | null {
  const def = BUILDINGS[buildingId];
  const current = buildings[buildingId];
  if (def.costFactor === null && current.level > 0) return null; // one-time, already built

  const cost = costAtLevel(def.baseCost, def.costFactor, current.level);
  if (!canAffordCost(resources, cost, def.minHardwareTier)) return null;

  let nextResources: Record<ResourceId, ResourceState> = payCost(resources, cost, def.minHardwareTier);
  if (def.capBonus) {
    for (const [id, amount] of Object.entries(def.capBonus) as [ResourceId, number][]) {
      const resource = nextResources[id];
      nextResources = {
        ...nextResources,
        [id]: { ...resource, cap: (resource.cap ?? 0) + amount },
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

export interface HireStaffResult {
  resources: GameState['resources'];
  staff: StaffState;
}

/** Hires one more `role`, per ECONOMY §3 — tech-gated, staff-cap-gated, cost-gated. */
export function hireStaff(
  resources: GameState['resources'],
  staff: StaffState,
  completedTech: string[],
  crewQuartersLevel: number,
  role: RoleId,
): HireStaffResult | null {
  if (!isRoleUnlocked(role, completedTech)) return null;
  if (totalHired(staff) >= totalStaffCap(crewQuartersLevel)) return null;

  const cost = hiringCost(role, staff.pools[role].hired);
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
 */
export function adjustStaffAssignment(
  staff: StaffState,
  role: RoleId,
  buildingId: BuildingId,
  delta: number,
  buildingLevel: number,
): StaffState | null {
  if (delta === 0) return null;
  const pool = staff.pools[role];
  const nextAssigned = (pool.assigned[buildingId] ?? 0) + delta;
  if (nextAssigned < 0) return null;

  if (delta > 0) {
    if (nextAssigned > buildingSlotCount(buildingId, role, buildingLevel)) return null;
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
