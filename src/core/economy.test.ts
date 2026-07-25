import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { applyGrant, costAtLevel, pitchYield, productionPerSecond, resolveEconomyTick } from './economy';
import type { ResourceState } from './types';

describe('costAtLevel', () => {
  it('returns the base cost unscaled at level 0', () => {
    expect(costAtLevel({ funding: 150 }, 1.14, 0)).toEqual({ funding: 150 });
  });

  it('scales by factor^level, rounded up', () => {
    // Finance: 150 F, factor 1.14 -> level 1 upgrade costs ceil(150 * 1.14) = 171
    expect(costAtLevel({ funding: 150 }, 1.14, 1)).toEqual({ funding: 171 });
  });

  it('scales every resource in a multi-resource cost', () => {
    // Fabrication: 350 F + 100 M, factor 1.15, level 2 -> ceil(350*1.3225), ceil(100*1.3225)
    expect(costAtLevel({ funding: 350, materials: 100 }, 1.15, 2)).toEqual({
      funding: 463,
      materials: 133,
    });
  });

  it('treats a null factor as a one-time cost regardless of level', () => {
    expect(costAtLevel({ funding: 300, materials: 100 }, null, 5)).toEqual({
      funding: 300,
      materials: 100,
    });
  });
});

describe('productionPerSecond', () => {
  it('multiplies base by level and staff ratio', () => {
    // Finance: +2 Funding/s per level, level 3, fully staffed
    expect(productionPerSecond(2, 3, 1)).toBe(6);
  });

  it('scales down with partial staffing', () => {
    // R&D Lab: +0.1 Research/s per level, level 5, half-staffed
    expect(productionPerSecond(0.1, 5, 0.5)).toBeCloseTo(0.25);
  });

  it('produces nothing at level 0 even if staffed', () => {
    expect(productionPerSecond(2, 0, 1)).toBe(0);
  });

  it('clamps staff ratio into [0, 1]', () => {
    expect(productionPerSecond(1, 1, 1.5)).toBe(1);
    expect(productionPerSecond(1, 1, -0.5)).toBe(0);
  });
});

describe('pitchYield', () => {
  it('matches ECONOMY_MODEL §2 examples (lv1=10, lv2=15, lv3=20)', () => {
    expect(pitchYield(1)).toBe(10);
    expect(pitchYield(2)).toBe(15);
    expect(pitchYield(3)).toBe(20);
  });
});

describe('applyGrant', () => {
  const resource = (overrides: Partial<ResourceState> = {}): ResourceState => ({
    amount: 100,
    cap: 500,
    lifetimeEarned: 100,
    ...overrides,
  });

  it('passive production (oneTime: false) halts at cap', () => {
    const result = applyGrant(resource({ amount: 480 }), 50, false);
    expect(result.amount).toBe(500);
    expect(result.lifetimeEarned).toBe(120); // only the 20 that actually fit
  });

  it('passive production does nothing once already at/over cap', () => {
    const result = applyGrant(resource({ amount: 500 }), 50, false);
    expect(result.amount).toBe(500);
    expect(result.lifetimeEarned).toBe(100);
  });

  it('one-time payments (oneTime: true) ignore the cap — GDD §1c', () => {
    const result = applyGrant(resource({ amount: 480 }), 50, true);
    expect(result.amount).toBe(530);
    expect(result.lifetimeEarned).toBe(150);
  });

  it('uncapped resources (cap: null) always take the full amount', () => {
    const result = applyGrant(resource({ cap: null, amount: 10_000 }), 50, false);
    expect(result.amount).toBe(10_050);
  });
});

describe('resolveEconomyTick', () => {
  it('produces Funding from a staffed Finance and pays salaries, over 60s', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.finance = 2;
    state.resources.funding.amount = 100;

    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, 60_000);

    expect(result.payrollUnpaid).toBe(false);
    // Finance: +2 F/s * level 1 * 60s = 120; salary: 2 technicians * 0.15 F/s * 60s = 18
    expect(result.resources.funding.amount).toBeCloseTo(100 - 18 + 120);
  });

  it('pauses ALL staffed production and does not deduct salary when insolvent (GDD §1b)', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.finance = 2;
    state.resources.funding.amount = 1; // not enough to cover salary this tick

    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, 60_000);

    expect(result.payrollUnpaid).toBe(true);
    expect(result.resources.funding.amount).toBe(1); // untouched: no debt, no production
  });

  it('resumes production automatically once funding covers salaries again', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.finance = 2;
    state.resources.funding.amount = 100;

    const first = resolveEconomyTick(state.resources, state.buildings, state.staff, 60_000);
    expect(first.payrollUnpaid).toBe(false);
    const second = resolveEconomyTick(first.resources, state.buildings, state.staff, 60_000);
    expect(second.payrollUnpaid).toBe(false);
    expect(second.resources.funding.amount).toBeGreaterThan(first.resources.funding.amount);
  });
});
