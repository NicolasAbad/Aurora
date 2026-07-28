import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import {
  assignedToBuilding,
  buildingSlotCount,
  buildingStaffRatio,
  hiringCost,
  isRoleUnlocked,
  staffRatioForBuilding,
  openSlotsForRole,
  totalHired,
  totalOpenSlots,
  totalSalaryPerSecond,
  totalStaffCap,
  unassignedCount,
} from './staff';

describe('hiringCost', () => {
  it('matches ECONOMY §3 formula', () => {
    expect(hiringCost('technician', 0)).toBe(50);
    expect(hiringCost('technician', 1)).toBeCloseTo(50 * 1.15);
    expect(hiringCost('scientist', 2)).toBeCloseTo(400 * 1.15 ** 2);
  });
});

describe('totalStaffCap', () => {
  it('is 2 before any Crew Quarters level, +3 per level after', () => {
    expect(totalStaffCap(0)).toBe(2);
    expect(totalStaffCap(1)).toBe(5);
    expect(totalStaffCap(3)).toBe(11);
  });
});

describe('isRoleUnlocked', () => {
  it('technician is always unlocked; gated roles need their tech', () => {
    expect(isRoleUnlocked('technician', [])).toBe(true);
    expect(isRoleUnlocked('engineer', [])).toBe(false);
    expect(isRoleUnlocked('engineer', ['basicEngineering'])).toBe(true);
  });
});

describe('buildingSlotCount / assignment helpers', () => {
  it('reads Finance slots (2 Technician) from data/buildings.ts once built', () => {
    expect(buildingSlotCount('finance', 'technician', 1)).toBe(2);
    expect(buildingSlotCount('finance', 'scientist', 1)).toBe(0);
  });

  // ECONOMY §4 (v2.8): "slots exist only at building level >= 1" — the Sprint 3.5 bug
  // fix. Same building/role the data declares 2 Technician slots for, but at level 0.
  it('is 0 for an unbuilt (level 0) building regardless of what the data declares', () => {
    expect(buildingSlotCount('finance', 'technician', 0)).toBe(0);
  });

  // ECONOMY §4 v3.6 (Sprint 8 economy unlock): slot-adding internal upgrades.
  describe('slot-adding internal upgrades (v3.6)', () => {
    it('Grants desk adds +1 Technician slot at Finance, no upgrade means no change', () => {
      expect(buildingSlotCount('finance', 'technician', 1)).toBe(2);
      expect(buildingSlotCount('finance', 'technician', 1, ['grantsDesk'])).toBe(3);
    });

    it('Technical archive adds +1 Scientist slot at R&D Lab, does not touch Technician', () => {
      expect(buildingSlotCount('rndLab', 'scientist', 1, ['technicalArchive'])).toBe(3);
      expect(buildingSlotCount('rndLab', 'technician', 1, ['technicalArchive'])).toBe(0);
    });

    it('Bulk contracts adds +1 Technician slot at Supply Depot', () => {
      expect(buildingSlotCount('supplyDepot', 'technician', 1)).toBe(2);
      expect(buildingSlotCount('supplyDepot', 'technician', 1, ['bulkContracts'])).toBe(3);
    });

    it('an unrelated owned upgrade (e.g. Classroom) does not affect slot count', () => {
      expect(buildingSlotCount('finance', 'technician', 1, ['classroom'])).toBe(2);
    });

    it('still 0 below level 1 even with the slot upgrade owned', () => {
      expect(buildingSlotCount('finance', 'technician', 0, ['grantsDesk'])).toBe(0);
    });
  });

  it('tracks hired/assigned/unassigned correctly', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 3;
    state.staff.pools.technician.assigned.finance = 2;

    expect(totalHired(state.staff)).toBe(3);
    expect(assignedToBuilding(state.staff, 'technician', 'finance')).toBe(2);
    expect(unassignedCount(state.staff, 'technician')).toBe(1);
  });

  it('computes staffRatioForBuilding as assigned/slots', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.finance = 1;
    expect(staffRatioForBuilding(state.staff, 'finance', 'technician', 1)).toBe(0.5);
  });
});

describe('buildingStaffRatio', () => {
  it('reduces to staffRatioForBuilding for a single-role building', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.finance = 1;
    expect(buildingStaffRatio(state.staff, 'finance', 1)).toBe(0.5);
  });

  it('is the MINIMUM across roles for a multi-role building (Fabrication: 1 Eng + 1 Tech) — the bottleneck rule, ratified and codified in ECONOMY §4 (v2.8)', () => {
    const state = createInitialState();
    state.staff.pools.engineer.hired = 1;
    state.staff.pools.technician.hired = 1;
    state.staff.pools.engineer.assigned.fabrication = 1; // engineer slot full (ratio 1)
    // technician slot left empty (ratio 0) — Fabrication needs BOTH, so overall ratio is 0.
    expect(buildingStaffRatio(state.staff, 'fabrication', 1)).toBe(0);
  });

  it('returns 1 for a building with no slots (ratio is irrelevant — nothing to scale)', () => {
    const state = createInitialState();
    expect(buildingStaffRatio(state.staff, 'warehouse', 1)).toBe(1);
  });
});

// NARRATIVE §7 (T-11): a Technician hire can't fill an Engineer slot even if the
// program has open Engineer slots elsewhere — the gate has to be role-specific.
describe('openSlotsForRole', () => {
  it('only counts slots the given role can actually fill', () => {
    const state = createInitialState();
    state.buildings.fabrication.level = 1; // 1 Engineer + 1 Technician slot, both empty
    expect(openSlotsForRole(state.staff, state.buildings, 'engineer')).toBe(1);
    expect(openSlotsForRole(state.staff, state.buildings, 'technician')).toBe(1);
    expect(openSlotsForRole(state.staff, state.buildings, 'scientist')).toBe(0);
  });
});

// UI_SPEC §4 / NARRATIVE §7: T-10's "Open slots across the program: [N]" line.
describe('totalOpenSlots', () => {
  it('is 0 when nothing is built (no slots exist below building level 1)', () => {
    const state = createInitialState();
    expect(totalOpenSlots(state.staff, state.buildings)).toBe(0);
  });

  it('counts every unfilled slot across every built building/role', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1; // 2 Technician slots
    state.buildings.fabrication.level = 1; // 1 Engineer + 1 Technician slot
    // Finance: 1/2 Technician filled. Fabrication: fully empty.
    state.staff.pools.technician.hired = 1;
    state.staff.pools.technician.assigned.finance = 1;
    // open: Finance 1 Tech + Fabrication 1 Eng + Fabrication 1 Tech = 3
    expect(totalOpenSlots(state.staff, state.buildings)).toBe(3);
  });

  it('is 0 once every built slot is filled', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.finance = 2;
    expect(totalOpenSlots(state.staff, state.buildings)).toBe(0);
  });
});

describe('totalSalaryPerSecond', () => {
  it('sums hired × salaryPerSec across all roles', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 4;
    state.staff.pools.engineer.hired = 1;
    // 4 * 0.15 + 1 * 0.35
    expect(totalSalaryPerSecond(state.staff)).toBeCloseTo(0.95);
  });
});
