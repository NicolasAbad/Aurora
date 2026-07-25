import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { adjustStaffAssignment, applyPitch, buyBuildingUpgrade, hireStaff } from './actions';

describe('applyPitch', () => {
  it('grants pitchYield(officesLevel) as a one-time Funding grant', () => {
    const state = createInitialState();
    const resources = applyPitch(state.resources, 1);
    expect(resources.funding.amount).toBe(10);
  });

  it('ignores the Funding cap (GDD §1c)', () => {
    const state = createInitialState();
    state.resources.funding.amount = 495;
    state.resources.funding.cap = 500;
    const resources = applyPitch(state.resources, 3); // yield 20
    expect(resources.funding.amount).toBe(515);
  });
});

describe('buyBuildingUpgrade', () => {
  it('returns null when unaffordable', () => {
    const state = createInitialState();
    expect(buyBuildingUpgrade(state.resources, state.buildings, 'finance')).toBeNull();
  });

  it('pays cost and increments level when affordable', () => {
    const state = createInitialState();
    state.resources.funding.amount = 200;
    const result = buyBuildingUpgrade(state.resources, state.buildings, 'finance');
    expect(result).not.toBeNull();
    expect(result!.buildings.finance.level).toBe(1);
    expect(result!.resources.funding.amount).toBe(50); // 200 - 150
  });

  it('refuses to re-buy a one-time building already built', () => {
    const state = createInitialState();
    state.resources.funding.amount = 10_000;
    state.buildings.launchRail.level = 1; // already built (one-time)
    expect(buyBuildingUpgrade(state.resources, state.buildings, 'launchRail')).toBeNull();
  });
});

describe('hireStaff', () => {
  it('hires an unlocked, affordable, in-cap role', () => {
    const state = createInitialState();
    state.resources.funding.amount = 100;
    const result = hireStaff(state.resources, state.staff, [], 0, 'technician');
    expect(result).not.toBeNull();
    expect(result!.staff.pools.technician.hired).toBe(1);
    expect(result!.resources.funding.amount).toBe(50); // base cost, 0 already hired
  });

  it('refuses a tech-gated role without its tech researched', () => {
    const state = createInitialState();
    state.resources.funding.amount = 1000;
    expect(hireStaff(state.resources, state.staff, [], 0, 'engineer')).toBeNull();
  });

  it('allows a tech-gated role once its tech is completed', () => {
    const state = createInitialState();
    state.resources.funding.amount = 1000;
    const result = hireStaff(state.resources, state.staff, ['basicEngineering'], 0, 'engineer');
    expect(result).not.toBeNull();
  });

  it('refuses to hire past the staff cap', () => {
    const state = createInitialState();
    state.resources.funding.amount = 10_000;
    state.staff.pools.technician.hired = 2; // starting cap is 2, crewQuarters level 0
    expect(hireStaff(state.resources, state.staff, [], 0, 'technician')).toBeNull();
  });

  it('scales cost by 1.15^hired', () => {
    const state = createInitialState();
    state.resources.funding.amount = 1000;
    state.staff.pools.technician.hired = 1;
    const result = hireStaff(state.resources, state.staff, [], 5, 'technician');
    expect(result!.resources.funding.amount).toBeCloseTo(1000 - 50 * 1.15);
  });
});

describe('adjustStaffAssignment', () => {
  it('assigns an unassigned hired unit up to the building slot count', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 1;
    const staff = adjustStaffAssignment(state.staff, 'technician', 'finance', 1);
    expect(staff).not.toBeNull();
    expect(staff!.pools.technician.assigned.finance).toBe(1);
  });

  it('refuses to assign more than are hired-and-unassigned', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 0;
    expect(adjustStaffAssignment(state.staff, 'technician', 'finance', 1)).toBeNull();
  });

  it('refuses to assign past the building slot count (Finance: 2 Technician)', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 3;
    state.staff.pools.technician.assigned.finance = 2;
    expect(adjustStaffAssignment(state.staff, 'technician', 'finance', 1)).toBeNull();
  });

  it('unassigns down to zero but not below', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 1;
    state.staff.pools.technician.assigned.finance = 1;
    const staff = adjustStaffAssignment(state.staff, 'technician', 'finance', -1);
    expect(staff!.pools.technician.assigned.finance).toBe(0);
    expect(adjustStaffAssignment(staff!, 'technician', 'finance', -1)).toBeNull();
  });
});
