import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { BUILDING_IDS } from '../data/buildings';
import { buildingActivityState, builtBuildingCount, getResourceRatePerSecond } from './selectors';

describe('getResourceRatePerSecond', () => {
  it('is zero for every resource in the initial state (no staff, no leveled producers)', () => {
    const state = createInitialState();
    expect(getResourceRatePerSecond(state, 'funding')).toBe(0);
    expect(getResourceRatePerSecond(state, 'research')).toBe(0);
    expect(getResourceRatePerSecond(state, 'materials')).toBe(0);
  });

  it('reflects building level and staffing once both are set, net of the hired staff salary burn', () => {
    const state = createInitialState();
    state.buildings.finance.level = 3;
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.finance = 2; // Finance needs 2 Technicians

    // Finance: +2 Funding/s per level, level 3, fully staffed -> 6 gross, minus
    // 2 Technicians' salary (0.15/s each, ECONOMY §3) -> 5.7 net (ECONOMY §3c).
    expect(getResourceRatePerSecond(state, 'funding')).toBeCloseTo(5.7);
  });

  it('scales down with partial staffing', () => {
    const state = createInitialState();
    state.buildings.finance.level = 3;
    state.staff.pools.technician.assigned.finance = 1; // 1 of 2 slots filled

    expect(getResourceRatePerSecond(state, 'funding')).toBe(3);
  });

  it('does not net salary burn against non-Funding resources', () => {
    const state = createInitialState();
    state.buildings.rndLab.level = 2;
    state.staff.pools.scientist.hired = 5; // expensive salary, but Research isn't Funding
    state.staff.pools.scientist.assigned.rndLab = 1;

    expect(getResourceRatePerSecond(state, 'research')).toBeGreaterThan(0);
  });

  it('nets salary.rate/salary.flat modifiers identically to resolveEconomyTick (ECONOMY §3c)', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 1; // 0.15/s base salary, no production

    const noModifiers = getResourceRatePerSecond(state, 'funding');
    expect(noModifiers).toBeCloseTo(-0.15);

    const modifiers = [
      { id: 'xp:teamCulture', source: 'teamCulture', target: 'salary.rate' as const, op: 'mult' as const, value: 0.95 },
      { id: 'event:starScientist', source: 'E-04', target: 'salary.flat' as const, op: 'add' as const, value: 0.6 },
    ];
    // (0.15 * 0.95 + 0.6) = 0.7425 salary cost -> -0.7425 net rate.
    expect(getResourceRatePerSecond(state, 'funding', modifiers, 0)).toBeCloseTo(-0.7425);
  });
});

describe('builtBuildingCount (UI_SPEC §2h, Site Map SECOND rework)', () => {
  it('counts Offices alone in the initial state (the only pre-built building)', () => {
    const state = createInitialState();
    expect(builtBuildingCount(state.buildings)).toBe(1);
  });

  it('increases by one for each building at level >= 1, regardless of level beyond that', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.buildings.rndLab.level = 5; // a higher level still only counts once
    expect(builtBuildingCount(state.buildings)).toBe(3); // offices + finance + rndLab
  });

  it('counts every building once it is all built', () => {
    const state = createInitialState();
    for (const id of BUILDING_IDS) state.buildings[id].level = 1;
    expect(builtBuildingCount(state.buildings)).toBe(BUILDING_IDS.length);
  });
});

describe('buildingActivityState (UI_SPEC §2h, Site Map THIRD reconception)', () => {
  it('is null for a non-producer building (nothing to report — VAB has no production field)', () => {
    const state = createInitialState();
    state.buildings.vab.level = 3;
    expect(buildingActivityState('vab', state)).toBeNull();
  });

  it('is null for an unbuilt producer (level 0)', () => {
    const state = createInitialState();
    expect(buildingActivityState('finance', state)).toBeNull();
  });

  it('is idle when built but nobody is assigned', () => {
    const state = createInitialState();
    state.buildings.finance.level = 2;
    expect(buildingActivityState('finance', state)).toBe('idle');
  });

  it('is active when staffed, funded, and (for a non-consumer) automatically fed', () => {
    const state = createInitialState();
    state.buildings.finance.level = 2;
    state.staff.pools.technician.assigned.finance = 2;
    expect(buildingActivityState('finance', state)).toBe('active');
  });

  it('is paused when payroll is unpaid, even if fully staffed (GDD §1b, outranks starvation)', () => {
    const state = createInitialState();
    state.buildings.fabrication.level = 2;
    state.staff.pools.engineer.assigned.fabrication = 1;
    state.staff.pools.technician.assigned.fabrication = 1;
    state.buildings.fabrication.starvedIndicator = true; // both true at once — payroll must win
    state.economyFlags.payrollUnpaid = true;
    expect(buildingActivityState('fabrication', state)).toBe('paused');
  });

  it('is starved for a staffed consumer with starvedIndicator true and payroll paid', () => {
    const state = createInitialState();
    state.buildings.fabrication.level = 2;
    state.staff.pools.engineer.assigned.fabrication = 1;
    state.staff.pools.technician.assigned.fabrication = 1;
    state.buildings.fabrication.starvedIndicator = true;
    expect(buildingActivityState('fabrication', state)).toBe('starved');
  });

  it('a non-consumer producer (Finance has no `consumes`) is never starved, even with starvedIndicator true', () => {
    const state = createInitialState();
    state.buildings.finance.level = 2;
    state.staff.pools.technician.assigned.finance = 2;
    state.buildings.finance.starvedIndicator = true; // shouldn't happen in practice, but the field exists on every BuildingState
    expect(buildingActivityState('finance', state)).toBe('active');
  });
});
