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

  it('reflects building level and staffing once both are set', () => {
    const state = createInitialState();
    state.buildings.finance.level = 3;
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.finance = 2; // Finance needs 2 Technicians

    // Finance: +2 Funding/s per level, level 3, fully staffed -> 6
    expect(getResourceRatePerSecond(state, 'funding')).toBe(6);
  });

  it('scales down with partial staffing', () => {
    const state = createInitialState();
    state.buildings.finance.level = 3;
    state.staff.pools.technician.assigned.finance = 1; // 1 of 2 slots filled

    expect(getResourceRatePerSecond(state, 'funding')).toBe(3);
  });
});
