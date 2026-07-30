// ECONOMY_MODEL.md §3 — staff roles. Hiring cost (hireable roles only) = baseCost ×
// HIRING_COST_EXPONENT^hiredOfThatRole.
import type { RoleId } from '../core/types';

// ECONOMY §3d v4.1 (Sprint 11.5 task 8, RE-OPENED): raised 1.15 -> 1.20. Sprint 11's
// "curve never binds" conclusion was correct for its own bot profiles (staff cap and the
// salary budget bind first, every time) — but real play (aggressively leveling one
// building, e.g. Finance, early) directly contradicted the FELT experience. The new
// "aggressive" sim profile (see sim/run.ts) confirmed it with real numbers: even a modest
// Finance level 5 (10 Funding/s) made the next hire cost 6.6s of income and the next
// promotion 10.0s — trivial in the moment, regardless of whether the curve is
// mathematically "binding" in the sim-bot sense. 1.20 roughly 1.5x's the cost by the
// 10th-20th hire of a role (1.20^15 ≈ 15.4x base vs 1.15^15 ≈ 8.1x) — the shape the
// original BACKLOG complaint named ("too shallow for a program that will never have
// thousands of staff"), without changing the first hire's cost at all (1.20^0 = 1.15^0).
export const HIRING_COST_EXPONENT = 1.2;

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
