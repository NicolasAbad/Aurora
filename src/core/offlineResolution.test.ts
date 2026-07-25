import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { OFFLINE_CAP_MS, resolveOffline } from './offlineResolution';

const HOUR = 60 * 60 * 1000;
const MIN = 60_000;

function staffedFinanceState() {
  const state = createInitialState();
  state.buildings.finance.level = 1;
  state.staff.pools.technician.hired = 2;
  state.staff.pools.technician.assigned.finance = 2;
  state.resources.funding.amount = 1000;
  state.resources.funding.cap = null; // isolate rate math from cap-halting (tested elsewhere)
  return state;
}

// Sprint 2 acceptance: "close 1h and return shows correct summary" (clock-manipulation test).
describe('resolveOffline — 1h clock-manipulation test', () => {
  it('applies exactly 1h of production and salary at the 60% offline rate', () => {
    const state = staffedFinanceState();
    const result = resolveOffline(state.resources, state.buildings, state.staff, 0, HOUR);

    expect(result.elapsedMs).toBe(HOUR);
    expect(result.appliedMs).toBe(HOUR);
    expect(result.capped).toBe(false);
    expect(result.stoppage).toBeNull();
    expect(result.payrollUnpaid).toBe(false);

    // Finance: 2 F/s * level 1 * ratio 1 * 0.6 rate * 3600s = 4320 credited
    // Salary: 2 technicians * 0.15 F/s * 0.6 rate * 3600s = 648 deducted
    expect(result.resources.funding.amount).toBeCloseTo(1000 - 648 + 4320, 0);
  });
});

describe('resolveOffline — offline cap (10h)', () => {
  it('caps applied time at OFFLINE_CAP_MS even when the real gap is much longer', () => {
    const state = staffedFinanceState();
    const twentyHours = 20 * HOUR;
    const result = resolveOffline(state.resources, state.buildings, state.staff, 0, twentyHours);

    expect(result.elapsedMs).toBe(twentyHours);
    expect(result.appliedMs).toBe(OFFLINE_CAP_MS);
    expect(result.capped).toBe(true);
  });

  it('accepts a custom cap (e.g. 16h once Remote Ops is researched, Sprint 4)', () => {
    const state = staffedFinanceState();
    const sixteenHours = 16 * HOUR;
    const result = resolveOffline(state.resources, state.buildings, state.staff, 0, sixteenHours, sixteenHours);
    expect(result.appliedMs).toBe(sixteenHours);
    expect(result.capped).toBe(false);
  });
});

describe('resolveOffline — insolvency mid-window (GDD §1b applies identically offline)', () => {
  it('reports a payroll-stoppage window once funding runs out, and stays unpaid to the end', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 1; // no Finance staffed — no income, only salary drain
    // 1 technician: salary 0.15 F/s * 0.6 rate * 60s/chunk = 5.4 F/chunk. 30 chunks = 162 F.
    state.resources.funding.amount = 162;
    state.resources.funding.cap = null;

    const oneHour = HOUR;
    const result = resolveOffline(state.resources, state.buildings, state.staff, 0, oneHour);

    expect(result.payrollUnpaid).toBe(true);
    expect(result.stoppage).not.toBeNull();
    // ~30 min of coverage before insolvency (162F / 5.4F-per-chunk) — allow one chunk of
    // slack since 0.15*0.6 isn't exactly representable in floating point, so the exact
    // boundary chunk can round either way; the important invariants are that it's in the
    // right ballpark and that it runs uninterrupted to the end of the window.
    expect(result.stoppage!.startedAtMs).toBeGreaterThanOrEqual(28 * MIN);
    expect(result.stoppage!.startedAtMs).toBeLessThanOrEqual(30 * MIN);
    expect(result.stoppage!.startedAtMs + result.stoppage!.durationMs).toBe(result.appliedMs);
    // No debt: funding never goes negative, and stops being deducted once unpaid —
    // whatever's left is under one chunk's salary cost (couldn't afford the next chunk).
    expect(result.resources.funding.amount).toBeGreaterThanOrEqual(0);
    expect(result.resources.funding.amount).toBeLessThan(6);
  });

  it('never triggers a stoppage when funding comfortably covers the whole window', () => {
    const state = staffedFinanceState();
    const result = resolveOffline(state.resources, state.buildings, state.staff, 0, HOUR);
    expect(result.stoppage).toBeNull();
  });
});
