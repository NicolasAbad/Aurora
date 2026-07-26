import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { isUnlockConditionMet, unlockContextFromState } from './unlockConditions';
import type { UnlockContext } from './unlockConditions';

function makeContext(overrides: Partial<UnlockContext> = {}): UnlockContext {
  return {
    lifetimeFunding: 0,
    completedTech: [],
    reputation: 0,
    auroraISuccess: false,
    buildings: createInitialState().buildings,
    ...overrides,
  };
}

describe('isUnlockConditionMet', () => {
  it('start is always met', () => {
    expect(isUnlockConditionMet({ kind: 'start' }, makeContext())).toBe(true);
  });

  it('locked is never met (visible-but-locked, e.g. Training Center)', () => {
    expect(isUnlockConditionMet({ kind: 'locked' }, makeContext())).toBe(false);
  });

  it('lifetimeFunding compares against the context threshold', () => {
    const condition = { kind: 'lifetimeFunding' as const, amount: 300 };
    expect(isUnlockConditionMet(condition, makeContext({ lifetimeFunding: 299 }))).toBe(false);
    expect(isUnlockConditionMet(condition, makeContext({ lifetimeFunding: 300 }))).toBe(true);
  });

  it('tech checks the completed-tech list', () => {
    const condition = { kind: 'tech' as const, id: 'testStand' };
    expect(isUnlockConditionMet(condition, makeContext())).toBe(false);
    expect(isUnlockConditionMet(condition, makeContext({ completedTech: ['testStand'] }))).toBe(true);
  });

  it('reputation compares against the context amount', () => {
    const condition = { kind: 'reputation' as const, amount: 40 };
    expect(isUnlockConditionMet(condition, makeContext({ reputation: 39 }))).toBe(false);
    expect(isUnlockConditionMet(condition, makeContext({ reputation: 40 }))).toBe(true);
  });

  it('auroraISuccess reads straight from the context flag', () => {
    const condition = { kind: 'auroraISuccess' as const };
    expect(isUnlockConditionMet(condition, makeContext())).toBe(false);
    expect(isUnlockConditionMet(condition, makeContext({ auroraISuccess: true }))).toBe(true);
  });

  it('buildingLevel checks a specific building at/above a level', () => {
    const condition = { kind: 'buildingLevel' as const, building: 'finance' as const, level: 2 };
    expect(isUnlockConditionMet(condition, makeContext())).toBe(false); // starts at level 0
    const buildings = { ...createInitialState().buildings, finance: { level: 2, upgrades: [], starvedIndicator: false, fedStreakMs: 0 } };
    expect(isUnlockConditionMet(condition, makeContext({ buildings }))).toBe(true);
  });

  it('all requires every sub-condition (Launch Pad B: Aurora I success + Reputation >= 40)', () => {
    const condition = {
      kind: 'all' as const,
      conditions: [{ kind: 'auroraISuccess' as const }, { kind: 'reputation' as const, amount: 40 }],
    };
    expect(isUnlockConditionMet(condition, makeContext({ auroraISuccess: true, reputation: 0 }))).toBe(false);
    expect(isUnlockConditionMet(condition, makeContext({ auroraISuccess: false, reputation: 40 }))).toBe(false);
    expect(isUnlockConditionMet(condition, makeContext({ auroraISuccess: true, reputation: 40 }))).toBe(true);
  });
});

describe('unlockContextFromState', () => {
  it('derives auroraISuccess from mission.launches (no dedicated flag in the schema)', () => {
    const state = createInitialState();
    expect(unlockContextFromState(state).auroraISuccess).toBe(false);

    state.mission.launches.push({ id: 'l1', padId: 'padA', missionType: 'auroraI', success: true, timestamp: Date.now() });
    expect(unlockContextFromState(state).auroraISuccess).toBe(true);
  });

  it('does not count a failed Aurora I launch as success', () => {
    const state = createInitialState();
    state.mission.launches.push({ id: 'l1', padId: 'padA', missionType: 'auroraI', success: false, timestamp: Date.now() });
    expect(unlockContextFromState(state).auroraISuccess).toBe(false);
  });

  it('reads lifetimeFunding/completedTech/reputation straight from state', () => {
    const state = createInitialState();
    state.resources.funding.lifetimeEarned = 500;
    state.research.completed = ['aluminum'];
    state.resources.reputation.amount = 12;
    const ctx = unlockContextFromState(state);
    expect(ctx.lifetimeFunding).toBe(500);
    expect(ctx.completedTech).toEqual(['aluminum']);
    expect(ctx.reputation).toBe(12);
  });
});
