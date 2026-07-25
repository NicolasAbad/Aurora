import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import {
  assignedToBuilding,
  buildingSlotCount,
  hiringCost,
  isRoleUnlocked,
  staffRatioForBuilding,
  totalHired,
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
  it('reads Finance slots (2 Technician) from data/buildings.ts', () => {
    expect(buildingSlotCount('finance', 'technician')).toBe(2);
    expect(buildingSlotCount('finance', 'scientist')).toBe(0);
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
    expect(staffRatioForBuilding(state.staff, 'finance', 'technician')).toBe(0.5);
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
