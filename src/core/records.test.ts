import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { contextFromState, RECORD_DEFS, resolveRecords } from './records';

describe('contextFromState', () => {
  it('derives every trigger signal from durable state only', () => {
    const state = createInitialState();
    state.certifications.engines.probe1.attempted = true;
    state.mission.launches = [
      { id: 'l1', padId: null, missionType: 's1', success: true, timestamp: 0 },
      { id: 'l2', padId: null, missionType: 's2', success: false, timestamp: 0 },
    ];
    state.contracts.active = [{ offerId: 'o1', acceptedAt: 0, padId: null, fulfilled: true }];

    const ctx = contextFromState(state);
    expect(ctx).toEqual({
      probe1Attempted: true,
      s1Success: true,
      s2Success: false, // that S-2 launch failed
      auroraISuccess: false,
      contractAccepted: true,
      contractFulfilled: true,
    });
  });
});

describe('resolveRecords', () => {
  it('grants nothing when no trigger condition is met', () => {
    const resources = createInitialState().resources;
    const ctx = { probe1Attempted: false, s1Success: false, s2Success: false, auroraISuccess: false, contractAccepted: false, contractFulfilled: false };
    const result = resolveRecords([], resources, ctx);
    expect(result.newlyEarned).toEqual([]);
    expect(result.records).toEqual([]);
    expect(result.resources).toBe(resources);
  });

  it('awards firstIgnition (200 F + 3 Rep) even for a scripted-failure-only attempt', () => {
    const resources = createInitialState().resources;
    const ctx = { probe1Attempted: true, s1Success: false, s2Success: false, auroraISuccess: false, contractAccepted: false, contractFulfilled: false };
    const result = resolveRecords([], resources, ctx);
    expect(result.newlyEarned).toEqual(['firstIgnition']);
    expect(result.resources.funding.amount).toBe(200);
    expect(result.resources.reputation.amount).toBe(3);
  });

  it('awards multiple newly-met records in one pass, each with its own reward', () => {
    const resources = createInitialState().resources;
    const ctx = { probe1Attempted: true, s1Success: true, s2Success: false, auroraISuccess: false, contractAccepted: true, contractFulfilled: false };
    const result = resolveRecords([], resources, ctx);
    expect(result.newlyEarned.sort()).toEqual(['firstCustomer', 'firstFlight', 'firstIgnition'].sort());
    expect(result.resources.funding.amount).toBe(200 + 500 + 400);
    expect(result.resources.reputation.amount).toBe(3 + 5 + 3);
  });

  it('never re-awards a record already present', () => {
    const resources = createInitialState().resources;
    const ctx = { probe1Attempted: true, s1Success: false, s2Success: false, auroraISuccess: false, contractAccepted: false, contractFulfilled: false };
    const result = resolveRecords(['firstIgnition'], resources, ctx);
    expect(result.newlyEarned).toEqual([]);
    expect(result.resources).toBe(resources);
  });

  it('every RecordId in the trigger table has a matching RECORD_DEFS entry', () => {
    const ctx = { probe1Attempted: true, s1Success: true, s2Success: true, auroraISuccess: true, contractAccepted: true, contractFulfilled: true };
    const result = resolveRecords([], createInitialState().resources, ctx);
    expect(result.newlyEarned.sort()).toEqual(Object.keys(RECORD_DEFS).sort());
  });
});
