import { BUILDINGS } from '../data/buildings';
import { ROLES, STARTING_STAFF_CAP } from '../data/roles';
import type { BuildingId, RoleId, StaffState } from './types';

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

/** ECONOMY §4 (v2.8): "slots exist only at building level >= 1" — an unbuilt building
 * has no assignment targets at all, regardless of what its BuildingDef declares. */
export function buildingSlotCount(buildingId: BuildingId, role: RoleId, level: number): number {
  if (level < 1) return 0;
  return BUILDINGS[buildingId].slots?.[role] ?? 0;
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

/** staffRatio for productionPerSecond: assigned/slots for a building, clamped by economy.ts. */
export function staffRatioForBuilding(
  staff: StaffState,
  buildingId: BuildingId,
  role: RoleId,
  level: number,
): number {
  const slots = buildingSlotCount(buildingId, role, level);
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
 */
export function buildingStaffRatio(staff: StaffState, buildingId: BuildingId, level: number): number {
  const roles = Object.keys(BUILDINGS[buildingId].slots ?? {}) as RoleId[];
  if (roles.length === 0) return 1;
  return Math.min(...roles.map((role) => staffRatioForBuilding(staff, buildingId, role, level)));
}
