import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { applyModifiers } from './modifiers';
import { OFFLINE_CAP_MS, resolveOffline } from './offlineResolution';
import type { Process } from './types';

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

function makeProcess(overrides: Partial<Process> = {}): Process {
  return {
    id: 'p1',
    kind: 'research',
    startedAt: 0,
    durationMs: 10 * MIN,
    payload: {},
    ...overrides,
  };
}

// Sprint 2 acceptance: "close 1h and return shows correct summary" (clock-manipulation test).
describe('resolveOffline — 1h clock-manipulation test', () => {
  it('applies exactly 1h of production and salary at the 60% offline rate', () => {
    const state = staffedFinanceState();
    const result = resolveOffline(state.resources, state.buildings, state.staff, [], [], 0, HOUR);

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
    const result = resolveOffline(state.resources, state.buildings, state.staff, [], [], 0, twentyHours);

    expect(result.elapsedMs).toBe(twentyHours);
    expect(result.appliedMs).toBe(OFFLINE_CAP_MS);
    expect(result.capped).toBe(true);
  });

  it('accepts a custom cap (e.g. 16h once Remote Ops is researched, Sprint 4)', () => {
    const state = staffedFinanceState();
    const sixteenHours = 16 * HOUR;
    const result = resolveOffline(
      state.resources,
      state.buildings,
      state.staff,
      [],
      [],
      0,
      sixteenHours,
      sixteenHours,
    );
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
    const result = resolveOffline(state.resources, state.buildings, state.staff, [], [], 0, oneHour);

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
    const result = resolveOffline(state.resources, state.buildings, state.staff, [], [], 0, HOUR);
    expect(result.stoppage).toBeNull();
  });

  // Edge case 1c: insolvency already active the moment the player left (not just
  // triggered mid-window) — GDD §1b gives no automatic offline recovery mechanism (no
  // income source runs while unpaid, so nothing can pay the balance down without the
  // player pitching, which can't happen while away). Confirms it persists unconditionally.
  it('stays unpaid for the entire window when already insolvent at close, with no partial recovery', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 1;
    state.resources.funding.amount = 0; // can't even cover the first chunk
    state.resources.funding.cap = null;

    const result = resolveOffline(state.resources, state.buildings, state.staff, [], [], 0, HOUR);

    expect(result.payrollUnpaid).toBe(true);
    expect(result.stoppage).toEqual({ startedAtMs: 0, durationMs: result.appliedMs });
    expect(result.resources.funding.amount).toBe(0); // untouched: no debt, no partial credit
  });
});

// Edge case 1d: system clock moved backward while away (a save's lastSeenAt ends up
// in the future relative to the reopen time) — must not go negative or double-grant.
describe('resolveOffline — lastSeenAt in the future (clock moved backward)', () => {
  it('clamps elapsed/applied time to 0 and leaves resources and processes untouched', () => {
    const state = staffedFinanceState();
    const p = makeProcess({ startedAt: 0, durationMs: 5 * MIN });
    // lastSeenAt (1h) is AFTER now (0) — e.g. the system clock was set backward.
    const result = resolveOffline(state.resources, state.buildings, state.staff, [], [p], HOUR, 0);

    expect(result.elapsedMs).toBe(0);
    expect(result.appliedMs).toBe(0);
    expect(result.capped).toBe(false);
    expect(result.stoppage).toBeNull();
    expect(result.resources.funding.amount).toBe(state.resources.funding.amount);
    // The process would have completed under forward time (durationMs 5min from t=0), but
    // `now` here (0) never reaches startedAt + durationMs, so it correctly stays pending —
    // nothing is granted based on a clock reading that can't be trusted.
    expect(result.completedProcesses).toEqual([]);
    expect(result.processes).toEqual([p]);
  });

  it('does not silently clear an already-unpaid payroll when zero time is applied', () => {
    const state = createInitialState();
    // wasPayrollUnpaid=true carried in from the caller's loaded economyFlags — no chunk
    // runs (elapsedMs=0), so there's nothing in this function's own loop to re-derive it.
    const result = resolveOffline(
      state.resources,
      state.buildings,
      state.staff,
      [],
      [],
      HOUR,
      0,
      OFFLINE_CAP_MS,
      true,
    );
    expect(result.appliedMs).toBe(0);
    expect(result.payrollUnpaid).toBe(true);
  });
});

// Edge cases 1a/1e: process resolution offline. Confirms both that a process (or one of
// several parallel ones) that completes mid-window is moved to `completedProcesses` and
// removed from `processes` on open, AND that process completion is entirely independent
// of the resource offline cap (ECONOMY §11: "processes at 100%").
describe('resolveOffline — process queue resolution', () => {
  it('completes a process that finishes mid-offline-window, leaving a still-running parallel one untouched', () => {
    const state = staffedFinanceState();
    const finishing = makeProcess({ id: 'finishing', startedAt: 0, durationMs: 30 * MIN });
    const stillRunning = makeProcess({ id: 'still-running', startedAt: 0, durationMs: 2 * HOUR });

    const result = resolveOffline(
      state.resources,
      state.buildings,
      state.staff,
      [],
      [finishing, stillRunning],
      0,
      HOUR, // 1h gap: `finishing` (30min) completes, `stillRunning` (2h) doesn't
    );

    expect(result.completedProcesses).toEqual([finishing]);
    expect(result.processes).toEqual([stillRunning]);
  });

  it('completes a 12h process at 100% even though the resource cap only applies 10h', () => {
    const state = staffedFinanceState();
    const longProcess = makeProcess({ id: 'long', startedAt: 0, durationMs: 12 * HOUR });
    const gap = 12 * HOUR;

    const result = resolveOffline(
      state.resources,
      state.buildings,
      state.staff,
      [],
      [longProcess],
      0,
      gap,
    );

    // Resources: capped at 10h worth of production/salary.
    expect(result.appliedMs).toBe(OFFLINE_CAP_MS);
    expect(result.capped).toBe(true);
    // Process: resolved against the full, uncapped 12h real gap — completes anyway.
    expect(result.completedProcesses).toEqual([longProcess]);
    expect(result.processes).toEqual([]);
  });
});

// ECONOMY §4b: "offline resolution uses these exact same rules" — the oscillation
// scenario (Supply Depot output tuned to exactly match Fabrication's demand, starving
// Refinery every tick) resolves the SAME way offline, at the 60% rate and chunked in
// 1-min steps, since every quantity involved scales by the same rateMultiplier and the
// ratio between supply and demand is rate-invariant.
describe('resolveOffline — starvation resolves identically offline (ECONOMY §4b)', () => {
  it('Fabrication stays fed and Refinery stays starved across an offline gap', () => {
    const state = createInitialState();
    // Same exact-match setup as economy.test.ts's oscillation case (Supply Depot lv2 =
    // Fabrication lv5's consumption at full ratio), all-integer levels.
    state.buildings.supplyDepot.level = 2;
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.supplyDepot = 2;
    state.buildings.fabrication.level = 5;
    state.staff.pools.engineer.hired = 2;
    state.staff.pools.technician.hired += 1;
    state.staff.pools.engineer.assigned.fabrication = 1;
    state.staff.pools.technician.assigned.fabrication = 1;
    state.buildings.refinery.level = 1;
    state.staff.pools.engineer.assigned.refinery = 1;
    state.resources.materials.cap = null;
    state.resources.funding.amount = 1_000_000;
    state.resources.funding.cap = null;

    const result = resolveOffline(state.resources, state.buildings, state.staff, [], [], 0, 5 * MIN);

    expect(result.payrollUnpaid).toBe(false);
    expect(result.buildings.fabrication.starvedIndicator).toBe(false);
    expect(result.buildings.refinery.starvedIndicator).toBe(true);
    expect(result.resources.hardware.amount).toBeGreaterThan(0); // Fabrication genuinely ran
    expect(result.resources.propellant.amount).toBe(0); // Refinery never got fed
  });
});

// Sprint 4 acceptance: "Remote Ops raises the offline cap via a modifier." resolveOffline
// itself just takes whatever offlineCapMs the caller passes (computeBootOffline is what
// queries applyModifiers before calling it) — this confirms passing the EXTENDED cap
// actually changes behavior, i.e. the composition point genuinely matters.
describe('resolveOffline — offline cap modifier (ECONOMY §5: Remote Ops)', () => {
  it('a 12h gap caps at the base 10h without the modifier, but is fully applied at the extended 16h', () => {
    const state = staffedFinanceState();
    const twelveHours = 12 * HOUR;

    const withoutRemoteOps = resolveOffline(state.resources, state.buildings, state.staff, [], [], 0, twelveHours, OFFLINE_CAP_MS);
    expect(withoutRemoteOps.appliedMs).toBe(OFFLINE_CAP_MS);
    expect(withoutRemoteOps.capped).toBe(true);

    const extendedCapMs = applyModifiers(OFFLINE_CAP_MS, [
      { id: 'research:remoteOps', source: 'remoteOps', target: 'offline.capMs', op: 'add', value: 6 * HOUR },
    ], 'offline.capMs');
    const withRemoteOps = resolveOffline(state.resources, state.buildings, state.staff, [], [], 0, twelveHours, extendedCapMs);
    expect(withRemoteOps.appliedMs).toBe(twelveHours);
    expect(withRemoteOps.capped).toBe(false);
  });
});
