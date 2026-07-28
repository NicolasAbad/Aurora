import { BUILDINGS } from '../data/buildings';
import { ROLES, STARTING_STAFF_CAP } from '../data/roles';
import type { BuildingId, GameState, RoleId, StaffState } from './types';

/** Cost to hire the next unit of `role`, per ECONOMY §3 (`base × 1.15^hiredOfRole`). */
export function hiringCost(role: RoleId, hiredOfRole: number): number {
  return ROLES[role].baseCost * 1.15 ** hiredOfRole;
}

/** Total staff cap: starting cap + Crew Quarters' staffCapBonus × level (ECONOMY §1). */
export function totalStaffCap(crewQuartersLevel: number): number {
  return STARTING_STAFF_CAP + (BUILDINGS.crewQuarters.staffCapBonus ?? 0) * crewQuartersLevel;
}

export function totalHired(staff: StaffState): number {
  return (Object.keys(ROLES) as RoleId[]).reduce((sum, role) => sum + staff.pools[role].hired, 0);
}

/** Direct hiring is tech-gated (ECONOMY §3); promotion is not (Sprint 1 doesn't need promotion). */
export function isRoleUnlocked(role: RoleId, completedTech: string[]): boolean {
  const unlockTech = ROLES[role].unlockTech;
  return unlockTech === null || completedTech.includes(unlockTech);
}

// ECONOMY §4 v3.6 (Sprint 8 economy unlock): slot-adding internal upgrades. Generic
// lookup by upgrade id — not special-cased per building (rule 3) — so any future
// slot-adding upgrade just adds a row here.
const SLOT_UPGRADE_BONUS: Partial<Record<string, { role: RoleId; amount: number }>> = {
  grantsDesk: { role: 'technician', amount: 1 },
  technicalArchive: { role: 'scientist', amount: 1 },
  bulkContracts: { role: 'technician', amount: 1 },
};

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
  let slots = BUILDINGS[buildingId].slots?.[role] ?? 0;
  for (const upgradeId of upgrades) {
    const bonus = SLOT_UPGRADE_BONUS[upgradeId];
    if (bonus && bonus.role === role) slots += bonus.amount;
  }
  return slots;
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
