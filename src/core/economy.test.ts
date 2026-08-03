import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import {
  applyGrant,
  costAtLevel,
  isManualVerbLowValue,
  pitchYield,
  productionPerSecond,
  resolveEconomyTick,
  trackingStationFlightXpMultiplier,
} from './economy';
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

  // ECONOMY §4d v4.1 (Sprint 11.5 task 9): multi-resource costs past a level threshold.
  describe('costThresholds', () => {
    const thresholds = [
      { level: 20, addCost: { materials: 40 } },
      { level: 50, addCost: { hardware: 15 } },
    ];

    it('is a no-op below the first threshold — identical to omitting costThresholds', () => {
      expect(costAtLevel({ funding: 150 }, 1.14, 10, thresholds)).toEqual(
        costAtLevel({ funding: 150 }, 1.14, 10),
      );
    });

    it('adds the threshold resource exactly at its own level, unscaled (factor^0)', () => {
      const result = costAtLevel({ funding: 150 }, 1.14, 20, thresholds);
      expect(result.materials).toBe(40);
      expect(result.hardware).toBeUndefined(); // level-50 threshold not reached yet
    });

    it('scales the added resource from the THRESHOLD level, not level 0', () => {
      // 10 levels past the level-20 threshold: 40 * 1.14^10 ≈ 148.28 -> ceil 149.
      const result = costAtLevel({ funding: 150 }, 1.14, 30, thresholds);
      expect(result.materials).toBe(Math.ceil(40 * 1.14 ** 10));
    });

    it('stacks every crossed threshold at once, each scaled from its own level', () => {
      const result = costAtLevel({ funding: 150 }, 1.14, 50, thresholds);
      expect(result.materials).toBe(Math.ceil(40 * 1.14 ** 30)); // 30 levels past its own threshold
      expect(result.hardware).toBe(15); // exactly at its own threshold
      expect(result.funding).toBe(Math.ceil(150 * 1.14 ** 50));
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

// UI_SPEC §4c v3.6 (Sprint 11.5): a manual verb recedes once its yield is worth less
// than ~1% of passive income — read as 1% of what passive production earns per minute
// (yieldAmount < passiveRatePerSec * 0.6).
describe('isManualVerbLowValue', () => {
  it('is false with zero (or no) passive income — nothing to compare against yet', () => {
    expect(isManualVerbLowValue(10, 0)).toBe(false);
  });

  it('is false when the yield is still worth >=1% of passive income', () => {
    // 10 Funding yield vs 10 Funding/s passive: 1% of a minute's income = 6. 10 >= 6.
    expect(isManualVerbLowValue(10, 10)).toBe(false);
  });

  it('is true once passive income dwarfs the yield', () => {
    // Same 10 Funding yield, but passive income now 100/s: 1% of a minute = 60. 10 < 60.
    expect(isManualVerbLowValue(10, 100)).toBe(true);
  });

  it('sits exactly at the boundary (not receded) when yield equals the threshold', () => {
    // 6 Funding yield vs 10/s passive: threshold is exactly 6 -> not LESS than, so false.
    expect(isManualVerbLowValue(6, 10)).toBe(false);
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

    // Fabrication: 0.3 H/s * level 1 * ratio 1 * 1s = 0.3 H; consumes 3 M per H (v4.1) = 0.9 M.
    expect(result.resources.hardware.amount).toBeCloseTo(0.3);
    expect(result.resources.hardware.byTier.aluminum).toBeCloseTo(0.3);
    expect(result.resources.materials.amount).toBeCloseTo(10 - 0.9);
    expect(result.buildings.fabrication.starvedIndicator).toBe(false);
  });

  it('binary-pauses (produces nothing, never negative) when Materials cannot cover the full tick', () => {
    const state = fabricationState(0.5); // needs 0.9 M this tick (v4.1), only has 0.5
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

  // Sprint 11.5 follow-up: updateStarvation used to spread a brand-new BuildingState
  // every tick, even once fedStreakMs/starvedIndicator had already settled — this exact
  // reference churn was the mechanical root cause behind TWO real bugs this session
  // (useRollingNumber, SiteMapCelebration), where a useEffect/timer keyed on `buildings`
  // restarted every tick before its own dismiss/rAF could ever fire. Regression-tests the
  // fix at its source rather than trusting every future consumer to avoid depending on
  // `buildings` by reference.
  it('once fed streak caps and starvedIndicator settles, further fed ticks return the SAME building object (not just equal values)', () => {
    let state = fabricationState(1000); // plenty of Materials, never starves
    let result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000);
    for (let i = 0; i < 3; i++) {
      state = { ...state, resources: result.resources, buildings: result.buildings };
      result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000);
    }
    expect(result.buildings.fabrication.starvedIndicator).toBe(false);
    expect(result.buildings.fabrication.fedStreakMs).toBe(3000); // hysteresis window fully elapsed

    const steadyStateBuilding = result.buildings.fabrication;
    state = { ...state, resources: result.resources, buildings: result.buildings };
    const next = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000);
    expect(next.buildings.fabrication).toBe(steadyStateBuilding); // reference identity, not just equality
  });

  it('oscillation case: Fabrication runs full-rate consistently while Refinery starves consistently, not both flickering', () => {
    // Supply Depot output tuned to exactly match Fabrication's per-tick demand, leaving
    // nothing for Refinery — fixed §4b claim order (Fabrication before Refinery) means
    // this resolves the SAME way every tick, not an alternating/proportional split.
    // Supply Depot lv3, full ratio (2 Tech): 1.5 * 3 * 1 = 4.5 M/s. Fabrication lv5, full
    // ratio (1 Eng + 1 Tech): consumes 0.3 * 5 * 3 = 4.5 M/s (v4.1: 3 M/H, was lv2/2 M/H
    // pre-Sprint-11.5) — an exact match, with every level an integer (ECONOMY §4 v2.8:
    // slots only exist at level >= 1, so a fractional level can no longer be used as a
    // shortcut to an arbitrary rate).
    let state = createInitialState();
    state.buildings.supplyDepot.level = 3;
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

// ECONOMY §4/§5 v3.6 (Sprint 8 economy unlock): QA station and Aluminum alloys both
// reduce Fabrication's Materials-per-Hardware, stacking multiplicatively; Recovery loop
// reduces Refinery's Materials-per-Propellant. All three default to no-op when absent
// (every pre-v3.6 test above passes unmodified, with modifiers/now omitted).
describe('resolveEconomyTick — Materials-consumption reductions (v3.6)', () => {
  function fabricationState(materialsAmount: number) {
    const state = createInitialState();
    state.buildings.fabrication.level = 1;
    state.staff.pools.engineer.hired = 1;
    state.staff.pools.technician.hired = 1;
    state.staff.pools.engineer.assigned.fabrication = 1;
    state.staff.pools.technician.assigned.fabrication = 1;
    state.resources.materials.amount = materialsAmount;
    state.resources.materials.cap = null;
    state.resources.funding.amount = 10_000;
    state.resources.funding.cap = null;
    return state;
  }

  it('QA station alone cuts Materials-per-Hardware by 15%', () => {
    const state = fabricationState(10);
    state.buildings.fabrication.upgrades = ['qaStation'];
    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000);
    // Base (v4.1): 0.3 H produced, consumes 3 M/H = 0.9 M. QA station: 0.9 * 0.85 = 0.765 M.
    expect(result.resources.materials.amount).toBeCloseTo(10 - 0.765);
  });

  it('Aluminum alloys alone (via the modifier registry) cuts it by 10%', () => {
    const state = fabricationState(10);
    const modifiers = [
      { id: 'research:aluminum', source: 'aluminum', target: 'fabrication.materialsPerHardware', op: 'mult' as const, value: 0.9 },
    ];
    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000, 1, modifiers, Date.now());
    expect(result.resources.materials.amount).toBeCloseTo(10 - 0.81); // 0.9 * 0.9 (v4.1)
  });

  it('QA station and Aluminum alloys stack multiplicatively', () => {
    const state = fabricationState(10);
    state.buildings.fabrication.upgrades = ['qaStation'];
    const modifiers = [
      { id: 'research:aluminum', source: 'aluminum', target: 'fabrication.materialsPerHardware', op: 'mult' as const, value: 0.9 },
    ];
    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000, 1, modifiers, Date.now());
    expect(result.resources.materials.amount).toBeCloseTo(10 - 0.9 * 0.85 * 0.9); // 10 - 0.6885 (v4.1)
  });

  it('Recovery loop cuts Refinery Materials-per-Propellant by 10%, independent of Fabrication', () => {
    const state = createInitialState();
    state.buildings.refinery.level = 1;
    state.buildings.refinery.upgrades = ['recoveryLoop'];
    state.staff.pools.engineer.hired = 1;
    state.staff.pools.engineer.assigned.refinery = 1;
    state.resources.materials.amount = 10;
    state.resources.materials.cap = null;
    state.resources.funding.amount = 10_000;
    state.resources.funding.cap = null;
    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000);
    // Base: 0.5 Propellant produced, consumes 1 M/P = 0.5 M. Recovery loop: 0.5 * 0.9 = 0.45 M.
    expect(result.resources.materials.amount).toBeCloseTo(10 - 0.45);
  });
});

// ECONOMY §9 (Sprint 10): Team culture's -5% salaries, registered on 'salary.rate'.
describe('resolveEconomyTick — salary.rate modifier', () => {
  it('scales the per-hire salary total, independent of the flat add-on', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 2; // 2 * 0.15/s = 0.3/s base
    state.resources.funding.amount = 10_000;
    state.resources.funding.cap = null;
    const modifiers = [{ id: 'xp:teamCulture', source: 'teamCulture', target: 'salary.rate', op: 'mult' as const, value: 0.95 }];
    const result = resolveEconomyTick(state.resources, state.buildings, state.staff, [], 1000, 1, modifiers, Date.now());
    // 0.3/s * 0.95 * 1s = 0.285 spent this tick.
    expect(result.resources.funding.amount).toBeCloseTo(10_000 - 0.285);
  });
});

// ECONOMY §4 (Sprint 10): Tracking Station's own Flight XP multiplier — "+25% per
// level", stacking multiplicatively with Antenna Network's flat "+25%".
describe('trackingStationFlightXpMultiplier', () => {
  it('is a 1x no-op at level 0 with no Antenna Network', () => {
    expect(trackingStationFlightXpMultiplier(0, false)).toBe(1);
  });

  it('adds 25% per level, linear (not compounding)', () => {
    expect(trackingStationFlightXpMultiplier(1, false)).toBeCloseTo(1.25);
    expect(trackingStationFlightXpMultiplier(4, false)).toBeCloseTo(2);
  });

  it('stacks multiplicatively with Antenna Network', () => {
    expect(trackingStationFlightXpMultiplier(1, true)).toBeCloseTo(1.25 * 1.25);
  });
});
