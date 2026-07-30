import { BUILDINGS } from '../data/buildings';
import { ROLES, STARTING_STAFF_CAP, type PromotionDef } from '../data/roles';
import { applyModifiers } from './modifiers';
import type { BuildingId, GameState, InternalUpgradeDef, Modifier, RoleId, StaffState } from './types';

/** Cost to hire the next unit of `role`, per ECONOMY §3 (`base × 1.15^hiredOfRole`).
 * `modifiers`/`now` (default `[]`/`0`, ECONOMY §9 Sprint 10): Recruiting's -15% hiring
 * cost registers on 'hiring.cost' — every pre-Sprint-10 call site that omits them keeps
 * the exact old value (applyModifiers with no matching modifiers is a no-op). Only ever
 * called for a hireable role (ROLES[role].baseCost is defined) — see isRoleUnlocked. */
export function hiringCost(role: RoleId, hiredOfRole: number, modifiers: Modifier[] = [], now = 0): number {
  return applyModifiers(ROLES[role].baseCost! * 1.15 ** hiredOfRole, modifiers, 'hiring.cost', now);
}

/** Total staff cap: starting cap + Crew Quarters' staffCapBonus × level (ECONOMY §1). */
export function totalStaffCap(crewQuartersLevel: number): number {
  return STARTING_STAFF_CAP + (BUILDINGS.crewQuarters.staffCapBonus ?? 0) * crewQuartersLevel;
}

export function totalHired(staff: StaffState): number {
  return (Object.keys(ROLES) as RoleId[]).reduce((sum, role) => sum + staff.pools[role].hired, 0);
}

/** Direct hiring: promotion-only roles (Engineer/Scientist, ECONOMY §3 v4.1) are never
 * hireable regardless of tech; everything else is tech-gated (Sprint 1 doesn't need
 * promotion). */
export function isRoleUnlocked(role: RoleId, completedTech: string[]): boolean {
  if (!ROLES[role].hireable) return false;
  const unlockTech = ROLES[role].unlockTech;
  return unlockTech === null || completedTech.includes(unlockTech);
}

// ECONOMY §5 v4.1 (Sprint 11.5): basicEngineering/scientificMethod, repurposed from
// hiring-unlock techs into promotion accelerators, each register ONE modifier (CLAUDE.md
// rule 4) targeting the promotion they speed up — applied against BOTH the Funding cost
// and the duration below, since a single 'mult' modifier composes fine against either
// base value independently (no separate cost/duration target needed).
function promotionAcceleratorTarget(to: RoleId): string {
  return to === 'scientist' ? 'promotion.engineerToScientist' : 'promotion.technicianToEngineer';
}

/** Effective Funding cost for `promo`, net of any owned accelerator (basicEngineering/
 * scientificMethod). `modifiers`/`now` default to `[]`/`0` — omitting them yields the
 * plain documented cost, same optional-tail pattern as hiringCost above. */
export function promotionCost(promo: PromotionDef, modifiers: Modifier[] = [], now = 0): number {
  return Math.ceil(applyModifiers(promo.costFunding, modifiers, promotionAcceleratorTarget(promo.to), now));
}

/** Effective training duration for `promo`, net of any owned accelerator — same
 * accelerator target as promotionCost, applied to the duration instead of the cost. */
export function promotionDurationMs(promo: PromotionDef, modifiers: Modifier[] = [], now = 0): number {
  return applyModifiers(promo.durationMs, modifiers, promotionAcceleratorTarget(promo.to), now);
}

// ECONOMY §4 v3.6 (Sprint 8 economy unlock): slot-adding internal upgrades. Generic
// lookup by upgrade id — not special-cased per building (rule 3) — so any future
// slot-adding upgrade just adds a row here.
const SLOT_UPGRADE_BONUS: Partial<Record<string, { role: RoleId; amount: number }>> = {
  grantsDesk: { role: 'technician', amount: 1 },
  technicalArchive: { role: 'scientist', amount: 1 },
  bulkContracts: { role: 'technician', amount: 1 },
};

// ECONOMY §4c (v3.8, Sprint 9.5 SCOPED UNLOCK): every 10 levels (10, 20, 30…), a slotted
// building gains +1 slot in EACH role it already employs — universal, automatic,
// coexisting with the specific slot-adding upgrades above (which remain the earlier,
// targeted lever). "Already employs" means the building has a nonzero BASE slot for that
// role — this never creates a slot for a role the building never had one for.
export const BUILDING_EXPANSION_MILESTONE_LEVELS = 10;

/** ECONOMY §4 (v2.8): "slots exist only at building level >= 1" — an unbuilt building
 * has no assignment targets at all, regardless of what its BuildingDef declares.
 * `upgrades` (default none) adds any owned slot-adding internal upgrade's bonus on top —
 * omit it for buildings that never carry one; existing call sites are unaffected. */
export function buildingSlotCount(
  buildingId: BuildingId,
  role: RoleId,
  level: number,
  upgrades: string[] = [],
): number {
  if (level < 1) return 0;
  const baseSlots = BUILDINGS[buildingId].slots?.[role] ?? 0;
  let slots = baseSlots;
  for (const upgradeId of upgrades) {
    const bonus = SLOT_UPGRADE_BONUS[upgradeId];
    if (bonus && bonus.role === role) slots += bonus.amount;
  }
  if (baseSlots > 0) slots += Math.floor(level / BUILDING_EXPANSION_MILESTONE_LEVELS);
  return slots;
}

/** UI_SPEC §4 (v3.7, T-12a/T-12b): the slot-adding internal upgrade for this
 * building+role, if one is defined (regardless of whether it's already owned — the
 * caller decides what to show based on ownership). Returns undefined for a building/role
 * with no such upgrade, in which case "fully staffed" has no further lever to name. */
export function slotUpgradeForRole(buildingId: BuildingId, role: RoleId): InternalUpgradeDef | undefined {
  return BUILDINGS[buildingId].internalUpgrades?.find((u) => SLOT_UPGRADE_BONUS[u.id]?.role === role);
}

export function assignedToBuilding(staff: StaffState, role: RoleId, buildingId: BuildingId): number {
  return staff.pools[role].assigned[buildingId] ?? 0;
}

/** Hired but not currently assigned to any building. */
export function unassignedCount(staff: StaffState, role: RoleId): number {
  const pool = staff.pools[role];
  const assignedTotal = Object.values(pool.assigned).reduce((sum, n) => sum + n, 0);
  return pool.hired - assignedTotal;
}

/** Sum of hired × salaryPerSec across every role (ECONOMY §3). */
export function totalSalaryPerSecond(staff: StaffState): number {
  return (Object.keys(ROLES) as RoleId[]).reduce(
    (sum, role) => sum + staff.pools[role].hired * ROLES[role].salaryPerSec,
    0,
  );
}

/** staffRatio for productionPerSecond: assigned/slots for a building, clamped by economy.ts.
 * `upgrades` (default none): see buildingSlotCount. */
export function staffRatioForBuilding(
  staff: StaffState,
  buildingId: BuildingId,
  role: RoleId,
  level: number,
  upgrades: string[] = [],
): number {
  const slots = buildingSlotCount(buildingId, role, level, upgrades);
  if (slots === 0) return 0;
  return assignedToBuilding(staff, role, buildingId) / slots;
}

/**
 * Overall staffRatio for a building that may require MULTIPLE roles (e.g. Fabrication:
 * 1 Engineer + 1 Technician) — ECONOMY §4 (v2.8): the bottleneck rule, ratifying the
 * Sprint 3 implementation. Production needs every required role staffed, so the
 * building's ratio is the MINIMUM across its required roles' individual ratios (an
 * empty Engineer slot means 0 output even with a full Technician slot). Single-role
 * buildings reduce to the same value staffRatioForBuilding would give; no-slot buildings
 * (Warehouse, etc.) return 1 (ratio is irrelevant — they have no `production` to scale).
 * `upgrades` (default none): see buildingSlotCount.
 */
export function buildingStaffRatio(
  staff: StaffState,
  buildingId: BuildingId,
  level: number,
  upgrades: string[] = [],
): number {
  const roles = Object.keys(BUILDINGS[buildingId].slots ?? {}) as RoleId[];
  if (roles.length === 0) return 1;
  return Math.min(...roles.map((role) => staffRatioForBuilding(staff, buildingId, role, level, upgrades)));
}

/** Unfilled slots for a single role across every building — what a NEW hire of that
 * role would actually have available to fill. Used to gate T-11 (about to hire with 0
 * open slots for THIS role, specifically, since a Technician hire can't fill an
 * Engineer slot even if the program has open Engineer slots elsewhere). */
export function openSlotsForRole(staff: StaffState, buildings: GameState['buildings'], role: RoleId): number {
  return (Object.keys(BUILDINGS) as BuildingId[]).reduce((sum, buildingId) => {
    const slots = buildingSlotCount(buildingId, role, buildings[buildingId].level, buildings[buildingId].upgrades);
    const assigned = assignedToBuilding(staff, role, buildingId);
    return sum + Math.max(0, slots - assigned);
  }, 0);
}

/** UI_SPEC §4 / NARRATIVE §7 (the idle-staff trap, T-10): total unfilled slots across
 * every building and role in the program — "Open slots across the program: [N]," always
 * visible in the hiring panel so a hire's destination (or lack of one) is never a
 * surprise found out later. */
export function totalOpenSlots(staff: StaffState, buildings: GameState['buildings']): number {
  return (Object.keys(ROLES) as RoleId[]).reduce(
    (sum, role) => sum + openSlotsForRole(staff, buildings, role),
    0,
  );
}
