// ECONOMY_MODEL.md §3 — staff roles. Hiring cost = baseCost × 1.15^hiredOfThatRole.
import type { RoleId } from '../core/types';

export interface RoleDef {
  id: RoleId;
  baseCost: number;
  salaryPerSec: number;
  unlockTech: string | null; // null = hireable from game start
}

export const ROLES: Record<RoleId, RoleDef> = {
  technician: { id: 'technician', baseCost: 50, salaryPerSec: 0.15, unlockTech: null },
  engineer: { id: 'engineer', baseCost: 150, salaryPerSec: 0.35, unlockTech: 'basicEngineering' },
  scientist: { id: 'scientist', baseCost: 400, salaryPerSec: 0.6, unlockTech: 'scientificMethod' },
  controller: { id: 'controller', baseCost: 250, salaryPerSec: 0.35, unlockTech: 'flightOperations' },
};

// ECONOMY §1: staff cap before any Crew Quarters level. Crew Quarters adds
// data/buildings.ts's staffCapBonus (+3) per level on top.
export const STARTING_STAFF_CAP = 2;
