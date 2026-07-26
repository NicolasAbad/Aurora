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

    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 60_000);

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

    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 60_000);

    expect(result.payrollUnpaid).toBe(true);
    expect(result.resources.funding.amount).toBe(1); // untouched: no debt, no production
  });

  it('resumes production automatically once funding covers salaries again', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.finance = 2;
    state.resources.funding.amount = 100;

    const first = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 60_000);
    expect(first.payrollUnpaid).toBe(false);
    const second = resolveEconomyTick(first.resources, state.buildings, state.staff, [], 60_000);
    expect(second.payrollUnpaid).toBe(false);
    expect(second.resources.funding.amount).toBeGreaterThan(first.resources.funding.amount);
  });
});

// ECONOMY §4b (v2.7): fixed tick order (salaries -> pure producers -> consumers in §4
// table order), binary per-building starvation with hysteresis, Hardware tier crediting.
describe('resolveEconomyTick — Complex B consumers (ECONOMY §4b)', () => {
  function fabricationState(materialsAmount: number) {
    const state = createInitialState();
    state.buildings.fabrication.level = 1;
    state.staff.pools.engineer.hired = 1;
    state.staff.pools.technician.hired = 1;
    state.staff.pools.engineer.assigned.fabrication = 1;
    state.staff.pools.technician.assigned.fabrication = 1;
    state.resources.materials.amount = materialsAmount;
    state.resources.funding.amount = 10_000; // comfortably covers salaries for the tick
    state.resources.funding.cap = null;
    return state;
  }

  it('claims its full tick requirement and credits Hardware when Materials are sufficient', () => {
    const state = fabricationState(10);
    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000);

    // Fabrication: 0.3 H/s * level 1 * ratio 1 * 1s = 0.3 H; consumes 2 M per H = 0.6 M.
    expect(result.resources.hardware.amount).toBeCloseTo(0.3);
    expect(result.resources.hardware.byTier.aluminum).toBeCloseTo(0.3);
    expect(result.resources.materials.amount).toBeCloseTo(10 - 0.6);
    expect(result.buildings.fabrication.starvedIndicator).toBe(false);
  });

  it('binary-pauses (produces nothing, never negative) when Materials cannot cover the full tick', () => {
    const state = fabricationState(0.5); // needs 0.6 M this tick, only has 0.5
    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000);

    expect(result.resources.hardware.amount).toBe(0);
    expect(result.resources.materials.amount).toBe(0.5); // untouched, no partial claim
    expect(result.buildings.fabrication.starvedIndicator).toBe(true);
  });

  it('an unstaffed consumer is never marked starved (staffing IS the priority lever, GDD note)', () => {
    const state = createInitialState(); // fabrication level 0, nobody assigned
    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000);
    expect(result.buildings.fabrication.starvedIndicator).toBe(false);
  });

  it('credits Hardware at the current tier: aluminum by default, titanium once researched', () => {
    const state = fabricationState(10);

    const aluminumResult = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000);
    expect(aluminumResult.resources.hardware.byTier.aluminum).toBeCloseTo(0.3);
    expect(aluminumResult.resources.hardware.byTier.titanium).toBe(0);

    const titaniumResult = resolveEconomyTick(
      state.resources,
      state.buildings,
      state.staff,
      ['titanium'],
      1000,
    );
    expect(titaniumResult.resources.hardware.byTier.titanium).toBeCloseTo(0.3);
    expect(titaniumResult.resources.hardware.byTier.aluminum).toBe(0);
    // Invariant (SPRINTS.md acceptance): sum(byTier) === amount, either way.
    const h = titaniumResult.resources.hardware;
    expect(h.byTier.aluminum + h.byTier.titanium).toBeCloseTo(h.amount);
  });

  it('clears the starved indicator only after 3000ms of consecutive fed time (hysteresis), not on the first fed tick', () => {
    let state = fabricationState(0); // starved immediately: no Materials at all
    let result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000);
    expect(result.buildings.fabrication.starvedIndicator).toBe(true);

    // Feed it, but for less than the 3000ms clear threshold — restock materials each
    // tick (a real building's own Supply Depot would do this; isolating the hysteresis
    // behavior here rather than entangling it with Supply Depot's own production).
    state = { ...state, resources: result.resources, buildings: result.buildings };
    state.resources.materials.amount = 10;
    result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000); // +1000ms fed
    expect(result.buildings.fabrication.starvedIndicator).toBe(true); // still shown starved (hold)
    expect(result.buildings.fabrication.fedStreakMs).toBe(1000);

    state.resources = { ...result.resources, materials: { ...result.resources.materials, amount: 10 } };
    state.buildings = result.buildings;
    result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 2000); // +2000ms fed = 3000ms total
    expect(result.buildings.fabrication.starvedIndicator).toBe(false); // now clears
  });

  it('oscillation case: Fabrication runs full-rate consistently while Refinery starves consistently, not both flickering', () => {
    // Supply Depot output tuned to exactly match Fabrication's per-tick demand, leaving
    // nothing for Refinery — fixed §4b claim order (Fabrication before Refinery) means
    // this resolves the SAME way every tick, not an alternating/proportional split.
    // Supply Depot lv2, full ratio (2 Tech): 1.5 * 2 * 1 = 3.0 M/s. Fabrication lv5, full
    // ratio (1 Eng + 1 Tech): consumes 0.3 * 5 * 2 = 3.0 M/s — an exact match, with every
    // level an integer (ECONOMY §4 v2.8: slots only exist at level >= 1, so a fractional
    // level can no longer be used as a shortcut to an arbitrary rate).
    let state = createInitialState();
    state.buildings.supplyDepot.level = 2;
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.supplyDepot = 2;
    state.buildings.fabrication.level = 5;
    state.staff.pools.engineer.hired = 2;
    state.staff.pools.technician.hired += 1;
    state.staff.pools.engineer.assigned.fabrication = 1;
    state.staff.pools.technician.assigned.fabrication = 1;
    state.buildings.refinery.level = 1; // needs 0.5 M/s at full ratio
    state.staff.pools.engineer.assigned.refinery = 1;
    state.resources.materials.amount = 0;
    state.resources.materials.cap = null;
    state.resources.funding.amount = 100_000; // comfortably covers salaries across all 5 ticks
    state.resources.funding.cap = null;

    for (let i = 0; i < 5; i++) {
      const result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000);
      expect(result.buildings.fabrication.starvedIndicator).toBe(false);
      expect(result.buildings.refinery.starvedIndicator).toBe(true);
      expect(result.resources.materials.amount).toBeCloseTo(0); // fully claimed by Fabrication each tick
      state = { ...state, resources: result.resources, buildings: result.buildings };
    }
    expect(state.resources.hardware.amount).toBeGreaterThan(0); // Fabrication genuinely ran
    expect(state.resources.propellant.amount).toBe(0); // Refinery never got a single tick's worth
  });
});
