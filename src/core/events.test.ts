import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { EVENT_CHECK_INTERVAL_MS, EVENT_MIN_GAP_MS } from '../data/events';
import { DEFAULT_EVENTS_STATE, eligibleEvents, resolveEventChoice, tickEvents } from './events';
import type { EventsState, GameState } from './types';

const MIN = 60_000;

function ctx(overrides: Partial<Parameters<typeof eligibleEvents>[0]> = {}) {
  return { refineryBuilt: false, complexBBuilt: false, hardwareAmount: 0, scientistsHired: 0, ...overrides };
}

describe('eligibleEvents', () => {
  it('excludes every event when no precondition is met', () => {
    expect(eligibleEvents(ctx())).toEqual([]);
  });

  it('E-01 requires the Refinery built', () => {
    expect(eligibleEvents(ctx()).some((e) => e.id === 'E-01')).toBe(false);
    expect(eligibleEvents(ctx({ refineryBuilt: true })).some((e) => e.id === 'E-01')).toBe(true);
  });

  it('E-02/E-05/E-06 share the Complex B baseline gate', () => {
    const eligible = eligibleEvents(ctx({ complexBBuilt: true })).map((e) => e.id);
    expect(eligible).toEqual(expect.arrayContaining(['E-02', 'E-05', 'E-06']));
  });

  it('E-03 requires >= 15 Hardware', () => {
    expect(eligibleEvents(ctx({ hardwareAmount: 14 })).some((e) => e.id === 'E-03')).toBe(false);
    expect(eligibleEvents(ctx({ hardwareAmount: 15 })).some((e) => e.id === 'E-03')).toBe(true);
  });

  it('E-04 requires >= 1 Scientist hired', () => {
    expect(eligibleEvents(ctx({ scientistsHired: 0 })).some((e) => e.id === 'E-04')).toBe(false);
    expect(eligibleEvents(ctx({ scientistsHired: 1 })).some((e) => e.id === 'E-04')).toBe(true);
  });
});

describe('tickEvents', () => {
  it('accumulates active ms without rolling until a full 10-min window passes', () => {
    const result = tickEvents(DEFAULT_EVENTS_STATE, 5 * MIN, ctx(), false, 5 * MIN, () => 0);
    expect(result.events.activeMsAccumulated).toBe(5 * MIN);
    expect(result.events.pending).toBeNull();
  });

  it('rolls once the window completes, carrying forward the remainder', () => {
    const events: EventsState = { activeMsAccumulated: 0, lastEventAt: null, pending: null };
    // 12 min elapsed in one tick: one full window consumed, 2 min carried forward.
    // randomFn: first call is the 15% check (miss it), doesn't matter which event picked.
    const result = tickEvents(events, 12 * MIN, ctx({ refineryBuilt: true }), false, 12 * MIN, () => 0.99);
    expect(result.events.activeMsAccumulated).toBe(2 * MIN);
    expect(result.events.pending).toBeNull(); // 0.99 >= 0.15, missed the roll
  });

  it('fires an eligible event when the 15% roll hits', () => {
    const result = tickEvents(DEFAULT_EVENTS_STATE, EVENT_CHECK_INTERVAL_MS, ctx({ refineryBuilt: true }), false, EVENT_CHECK_INTERVAL_MS, () => 0);
    expect(result.events.pending).not.toBeNull();
    expect(result.events.lastEventAt).toBe(EVENT_CHECK_INTERVAL_MS);
  });

  it('does not fire if nothing is currently eligible, even on a hit', () => {
    const result = tickEvents(DEFAULT_EVENTS_STATE, EVENT_CHECK_INTERVAL_MS, ctx(), false, EVENT_CHECK_INTERVAL_MS, () => 0);
    expect(result.events.pending).toBeNull();
  });

  it('never fires during countdown, but still carries the window forward', () => {
    const result = tickEvents(DEFAULT_EVENTS_STATE, EVENT_CHECK_INTERVAL_MS, ctx({ refineryBuilt: true }), true, EVENT_CHECK_INTERVAL_MS, () => 0);
    expect(result.events.pending).toBeNull();
    expect(result.events.activeMsAccumulated).toBe(0);
  });

  it('respects the >=30 min minimum gap between events', () => {
    const events: EventsState = { activeMsAccumulated: 0, lastEventAt: 0, pending: null };
    const tooSoon = tickEvents(events, EVENT_CHECK_INTERVAL_MS, ctx({ refineryBuilt: true }), false, EVENT_MIN_GAP_MS - 1, () => 0);
    expect(tooSoon.events.pending).toBeNull();
    const okNow = tickEvents(events, EVENT_CHECK_INTERVAL_MS, ctx({ refineryBuilt: true }), false, EVENT_MIN_GAP_MS, () => 0);
    expect(okNow.events.pending).not.toBeNull();
  });

  it('is a no-op (still accumulates nothing new to roll) while a card is already pending', () => {
    const events: EventsState = { activeMsAccumulated: 0, lastEventAt: null, pending: { id: 'E-01', triggeredAt: 0 } };
    const result = tickEvents(events, EVENT_CHECK_INTERVAL_MS, ctx({ refineryBuilt: true }), false, EVENT_CHECK_INTERVAL_MS, () => 0);
    expect(result.events).toBe(events);
  });
});

describe('resolveEventChoice', () => {
  function stateWithPending(id: string, overrides: Partial<Pick<GameState, 'resources' | 'staff' | 'modifiers' | 'mission'>> = {}) {
    const base = createInitialState();
    return {
      resources: base.resources,
      staff: base.staff,
      modifiers: base.modifiers,
      mission: base.mission,
      events: { activeMsAccumulated: 0, lastEventAt: 1000, pending: { id, triggeredAt: 1000 } },
      ...overrides,
    };
  }

  it('returns null when nothing is pending', () => {
    const base = createInitialState();
    expect(resolveEventChoice({ ...base, events: DEFAULT_EVENTS_STATE }, 'A', 2000)).toBeNull();
  });

  it('E-01 option A: -5% current Funding (floored at 0)', () => {
    const state = stateWithPending('E-01');
    state.resources = { ...state.resources, funding: { ...state.resources.funding, amount: 1000 } };
    const result = resolveEventChoice(state, 'A', 2000)!;
    expect(result.resources.funding.amount).toBe(950);
    expect(result.events.pending).toBeNull();
  });

  it('E-01 option B: registers a 20-min production.rate=0 modifier', () => {
    const state = stateWithPending('E-01');
    const result = resolveEventChoice(state, 'B', 2000)!;
    expect(result.modifiers).toContainEqual({ id: 'event-E-01-halt-2000', source: 'E-01', target: 'production.rate', op: 'mult', value: 0, expiresAt: 2000 + 20 * MIN });
  });

  it('E-02 option A: +1000 Funding, -10 Reputation (never below 0)', () => {
    const state = stateWithPending('E-02');
    state.resources = { ...state.resources, reputation: { ...state.resources.reputation, amount: 5 } };
    const result = resolveEventChoice(state, 'A', 2000)!;
    expect(result.resources.funding.amount).toBe(1000);
    expect(result.resources.reputation.amount).toBe(0); // 5 - 10, floored
  });

  it('E-02 option B: +3 Reputation only', () => {
    const state = stateWithPending('E-02');
    const result = resolveEventChoice(state, 'B', 2000)!;
    expect(result.resources.reputation.amount).toBe(3);
    expect(result.resources.funding.amount).toBe(state.resources.funding.amount);
  });

  it('E-03 option A: -15 Hardware (never below 0)', () => {
    const state = stateWithPending('E-03');
    state.resources = {
      ...state.resources,
      hardware: { ...state.resources.hardware, amount: 10, byTier: { aluminum: 10, titanium: 0 } },
    };
    const result = resolveEventChoice(state, 'A', 2000)!;
    expect(result.resources.hardware.amount).toBe(0); // only 10 available, spend caps there
  });

  it('E-03 option B: adds 10 to mission.confidencePenaltyNext', () => {
    const state = stateWithPending('E-03');
    const result = resolveEventChoice(state, 'B', 2000)!;
    expect(result.mission.confidencePenaltyNext).toBe(10);
  });

  it('E-04 option A: +1 free Scientist and a permanent salary.flat +0.6 modifier', () => {
    const state = stateWithPending('E-04');
    const result = resolveEventChoice(state, 'A', 2000)!;
    expect(result.staff.pools.scientist.hired).toBe(1);
    expect(result.modifiers).toContainEqual({ id: 'event-E-04-salary-2000', source: 'E-04', target: 'salary.flat', op: 'add', value: 0.6 });
    expect(result.modifiers[0].expiresAt).toBeUndefined(); // permanent
  });

  it('E-04 option B: no effect at all', () => {
    const state = stateWithPending('E-04');
    const result = resolveEventChoice(state, 'B', 2000)!;
    expect(result.resources).toBe(state.resources);
    expect(result.staff).toBe(state.staff);
    expect(result.modifiers).toBe(state.modifiers);
  });

  it('E-05 option A: +15 Reputation and a 2h process.duration x1.1 modifier', () => {
    const state = stateWithPending('E-05');
    const result = resolveEventChoice(state, 'A', 2000)!;
    expect(result.resources.reputation.amount).toBe(15);
    expect(result.modifiers).toContainEqual({ id: 'event-E-05-duration-2000', source: 'E-05', target: 'process.duration', op: 'mult', value: 1.1, expiresAt: 2000 + 2 * 60 * MIN });
  });

  it('E-06 option A: buys 300 Materials for 200 Funding when affordable', () => {
    const state = stateWithPending('E-06');
    state.resources = { ...state.resources, funding: { ...state.resources.funding, amount: 200 } };
    const result = resolveEventChoice(state, 'A', 2000)!;
    expect(result.resources.funding.amount).toBe(0);
    expect(result.resources.materials.amount).toBe(300);
  });

  it('E-06 option A: silently no-ops (funds untouched) when Funding is short', () => {
    const state = stateWithPending('E-06');
    state.resources = { ...state.resources, funding: { ...state.resources.funding, amount: 100 } };
    const result = resolveEventChoice(state, 'A', 2000)!;
    expect(result.resources.funding.amount).toBe(100);
    expect(result.resources.materials.amount).toBe(0);
    expect(result.events.pending).toBeNull(); // still resolves/clears the card either way
  });
});
