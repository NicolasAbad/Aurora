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

// Single source of truth for the display label — was duplicated locally in
// BuildingTile.tsx and StaffHiring.tsx before consolidating here.
export const ROLE_LABEL: Record<RoleId, string> = {
  technician: 'Technician',
  engineer: 'Engineer',
  scientist: 'Scientist',
  controller: 'Controller',
};

// ECONOMY §1: staff cap before any Crew Quarters level. Crew Quarters adds
// data/buildings.ts's staffCapBonus (+3) per level on top.
export const STARTING_STAFF_CAP = 2;

// ECONOMY §3: "Promotions (Quarters Classroom): Tech->Engineer 100 F + 15 min *
// Engineer->Scientist 300 F + 45 min." Bootstrap rule: gated ONLY by the Classroom
// upgrade being built, never by the target role's direct-hire tech (that's the
// intended zero-Scientist bootstrap path — do not add a tech gate here).
export interface PromotionDef {
  from: RoleId;
  to: RoleId;
  costFunding: number;
  durationMs: number;
}

const MIN = 60_000;

export const PROMOTIONS: PromotionDef[] = [
  { from: 'technician', to: 'engineer', costFunding: 100, durationMs: 15 * MIN },
  { from: 'engineer', to: 'scientist', costFunding: 300, durationMs: 45 * MIN },
];
