import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { getResourceRatePerSecond } from './selectors';

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
