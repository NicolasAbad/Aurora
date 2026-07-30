// ECONOMY_MODEL.md §3 — staff roles. Hiring cost (hireable roles only) = baseCost ×
// 1.15^hiredOfThatRole.
import type { RoleId } from '../core/types';

export interface RoleDef {
  id: RoleId;
  // Absent for a promotion-only role (ECONOMY §3 v4.1) — there is no hiring-cost row
  // for Engineer/Scientist because there is no direct-hire path at all.
  baseCost?: number;
  salaryPerSec: number;
  unlockTech: string | null; // null = hireable from game start (once `hireable`, below)
  // ECONOMY §3 v4.1 (Sprint 11.5, GDD §2 v2.11): Engineer/Scientist are promotion-ONLY —
  // Technician is the sole entry point, and the Classroom (data/roles.ts's PROMOTIONS) is
  // the only path up the ladder. This is a structural gate (isRoleUnlocked below always
  // returns false for these two), not just an unreachable tech — do not add one back.
  hireable: boolean;
}

export const ROLES: Record<RoleId, RoleDef> = {
  technician: { id: 'technician', baseCost: 50, salaryPerSec: 0.15, unlockTech: null, hireable: true },
  engineer: { id: 'engineer', salaryPerSec: 0.35, unlockTech: null, hireable: false },
  scientist: { id: 'scientist', salaryPerSec: 0.6, unlockTech: null, hireable: false },
  controller: { id: 'controller', baseCost: 250, salaryPerSec: 0.35, unlockTech: 'flightOperations', hireable: true },
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
