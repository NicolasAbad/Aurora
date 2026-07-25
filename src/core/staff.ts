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

export function buildingSlotCount(buildingId: BuildingId, role: RoleId): number {
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
): number {
  const slots = buildingSlotCount(buildingId, role);
  if (slots === 0) return 0;
  return assignedToBuilding(staff, role, buildingId) / slots;
}
