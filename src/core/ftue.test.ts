import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { ftueTooltipCondition, nextFtueTooltip } from './ftue';

describe('ftueTooltipCondition', () => {
  it('T-01 (Start) is always true', () => {
    expect(ftueTooltipCondition('T-01', createInitialState())).toBe(true);
  });

  it('T-02 (50 Funding) tracks current balance, not lifetime earned, once Finance is built', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    expect(ftueTooltipCondition('T-02', state)).toBe(false);
    state.resources.funding.amount = 49;
    expect(ftueTooltipCondition('T-02', state)).toBe(false);
    state.resources.funding.amount = 50;
    expect(ftueTooltipCondition('T-02', state)).toBe(true);
  });

  // CLAUDE.md rule 13 / NARRATIVE v3.6: real bug, T-02 used to fire on Funding alone,
  // before the Campus staged-reveal rules existed — StaffHiring (and hiring itself)
  // isn't reachable until Finance is built (App.tsx's financeLevel >= 1 gate), so a
  // Funding-only check could tell the player "you can afford your first technician" with
  // no way to act on it yet.
  it('T-02 does NOT fire on Funding alone before Finance is built (real bug, fixed)', () => {
    const state = createInitialState();
    state.resources.funding.amount = 500;
    expect(state.buildings.finance.level).toBe(0);
    expect(ftueTooltipCondition('T-02', state)).toBe(false);
  });

  it('T-03 (First hire) tracks any role hired', () => {
    const state = createInitialState();
    expect(ftueTooltipCondition('T-03', state)).toBe(false);
    state.staff.pools.technician.hired = 1;
    expect(ftueTooltipCondition('T-03', state)).toBe(true);
  });

  it('T-04 (First timer) is true for a process in any of the three slots', () => {
    const state = createInitialState();
    expect(ftueTooltipCondition('T-04', state)).toBe(false);
    state.processes = [{ id: 'x', kind: 'training', startedAt: 0, durationMs: 1000, payload: {} }];
    expect(ftueTooltipCondition('T-04', state)).toBe(true);

    const state2 = createInitialState();
    state2.research.inProgress = { id: 'r', kind: 'research', startedAt: 0, durationMs: 1000, payload: {} };
    expect(ftueTooltipCondition('T-04', state2)).toBe(true);
  });

  it('T-05 (Cap reached) is true only when a NUMERICALLY capped resource is at/over cap', () => {
    const state = createInitialState();
    expect(ftueTooltipCondition('T-05', state)).toBe(false);
    state.resources.funding.amount = 500;
    state.resources.funding.cap = 500;
    expect(ftueTooltipCondition('T-05', state)).toBe(true);
  });

  it('T-05 ignores null-cap resources (research/reputation/flightxp)', () => {
    const state = createInitialState();
    state.resources.research.amount = 1_000_000; // cap: null
    expect(ftueTooltipCondition('T-05', state)).toBe(false);
  });

  it('T-07 (payroll unpaid) mirrors economyFlags.payrollUnpaid', () => {
    const state = createInitialState();
    expect(ftueTooltipCondition('T-07', state)).toBe(false);
    state.economyFlags.payrollUnpaid = true;
    expect(ftueTooltipCondition('T-07', state)).toBe(true);
  });

  it('T-08 (VAB build starts) fires once any pad leaves rocketStatus "none"', () => {
    const state = createInitialState();
    expect(ftueTooltipCondition('T-08', state)).toBe(false);
    state.mission.pads.padA!.rocketStatus = 'integrating';
    expect(ftueTooltipCondition('T-08', state)).toBe(true);
  });

  it('T-09 (R&D Lab, zero Scientists) requires the Lab built AND no Scientists hired', () => {
    const state = createInitialState();
    expect(ftueTooltipCondition('T-09', state)).toBe(false); // Lab not built
    state.buildings.rndLab.level = 1;
    expect(ftueTooltipCondition('T-09', state)).toBe(true);
    state.staff.pools.scientist.hired = 1;
    expect(ftueTooltipCondition('T-09', state)).toBe(false);
  });

  it('T-24 (Confidence explainer) requires an in-flight mission with Confidence below 100, not just the resting default', () => {
    const state = createInitialState();
    expect(ftueTooltipCondition('T-24', state)).toBe(false); // no mission in flight at all
    state.mission.pads.padA!.rocketStatus = 'integrating';
    state.mission.pads.padA!.confidence = 0;
    expect(ftueTooltipCondition('T-24', state)).toBe(true);

    const soundingState = createInitialState();
    soundingState.mission.sounding = {
      rocketId: 's1',
      contractId: null,
      checklist: { assembled: false, propellantReady: false, weatherWindow: false, flightReview: false },
      confidence: 65,
      committedRoll: null,
    };
    expect(ftueTooltipCondition('T-24', soundingState)).toBe(true);
  });

  it('T-25 (first orbital attempt) fires the same moment T-08 does — the first VAB stage starting', () => {
    const state = createInitialState();
    expect(ftueTooltipCondition('T-25', state)).toBe(false);
    state.mission.pads.padA!.rocketStatus = 'integrating';
    expect(ftueTooltipCondition('T-25', state)).toBe(true);
  });
});

describe('nextFtueTooltip', () => {
  it('returns T-01 on a fresh save with nothing dismissed', () => {
    expect(nextFtueTooltip(createInitialState(), new Set())).toBe('T-01');
  });

  it('returns null once every eligible tooltip has been dismissed', () => {
    expect(nextFtueTooltip(createInitialState(), new Set(['T-01']))).toBeNull();
  });

  it('skips a dismissed tooltip even if its condition is true, revealing the next one', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.resources.funding.amount = 50; // T-01 and T-02 both eligible
    expect(nextFtueTooltip(state, new Set(['T-01']))).toBe('T-02');
  });

  it('only ever returns one id at a time, in NARRATIVE §2 order, even with several conditions true', () => {
    const state = createInitialState();
    state.resources.funding.amount = 50;
    state.staff.pools.technician.hired = 1;
    state.economyFlags.payrollUnpaid = true;
    // T-01 comes first in FTUE_TOOLTIP_ORDER, so it wins even though T-02/T-03/T-07 are also true.
    expect(nextFtueTooltip(state, new Set())).toBe('T-01');
    expect(nextFtueTooltip(state, new Set(['T-01', 'T-02', 'T-03']))).toBe('T-07');
  });
});
