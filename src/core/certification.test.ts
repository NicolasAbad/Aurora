import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { CERTIFICATION_TESTS_BY_ID } from '../data/certifications';
import {
  certificationDurationMultiplier,
  isCertificationTestAvailable,
  resolveCertification,
  type CertificationState,
} from './certification';
import type { EngineCertificationState, Process } from './types';

const MIN = 60_000;

function engineState(overrides: Partial<EngineCertificationState> = {}): EngineCertificationState {
  return { attempted: false, certified: false, extendedCertified: false, ...overrides };
}

function test(id: string) {
  const t = CERTIFICATION_TESTS_BY_ID.get(id);
  if (!t) throw new Error(`unknown test id: ${id}`);
  return t;
}

describe('isCertificationTestAvailable', () => {
  it('the first-stage test is available only before any attempt', () => {
    expect(isCertificationTestAvailable(test('probe1Test1'), engineState())).toBe(true);
    expect(isCertificationTestAvailable(test('probe1Test1'), engineState({ attempted: true }))).toBe(false);
  });

  it('the retry-stage test is available only after an attempt and before certification', () => {
    expect(isCertificationTestAvailable(test('probe1Test2'), engineState())).toBe(false);
    expect(isCertificationTestAvailable(test('probe1Test2'), engineState({ attempted: true }))).toBe(true);
    expect(
      isCertificationTestAvailable(test('probe1Test2'), engineState({ attempted: true, certified: true })),
    ).toBe(false);
  });

  it('the extended test is available only once certified and not already extended', () => {
    expect(isCertificationTestAvailable(test('probe1Extended'), engineState({ certified: true }))).toBe(true);
    expect(isCertificationTestAvailable(test('probe1Extended'), engineState())).toBe(false);
    expect(
      isCertificationTestAvailable(
        test('probe1Extended'),
        engineState({ certified: true, extendedCertified: true }),
      ),
    ).toBe(false);
  });
});

describe('certificationDurationMultiplier — ECONOMY §4 v3.5 SCOPED UNLOCK', () => {
  it('level 1 (or below) with no Instrumentation: no reduction', () => {
    expect(certificationDurationMultiplier(1, false)).toBe(1);
    expect(certificationDurationMultiplier(0, false)).toBe(1);
  });

  it('each level beyond 1 is -3%, linear (not compounding)', () => {
    expect(certificationDurationMultiplier(2, false)).toBeCloseTo(0.97);
    expect(certificationDurationMultiplier(5, false)).toBeCloseTo(0.88);
  });

  it('Instrumentation stacks multiplicatively with the level bonus', () => {
    expect(certificationDurationMultiplier(1, true)).toBeCloseTo(0.75);
    expect(certificationDurationMultiplier(5, true)).toBeCloseTo(0.88 * 0.75);
  });

  it('never goes negative at absurd levels', () => {
    expect(certificationDurationMultiplier(100, false)).toBeGreaterThanOrEqual(0);
  });
});

describe('resolveCertification', () => {
  function makeState(overrides: Partial<CertificationState> = {}): CertificationState {
    return { engines: createInitialState().certifications.engines, inProgress: null, ...overrides };
  }

  it('does nothing when nothing is in progress', () => {
    const state = createInitialState();
    const result = resolveCertification(makeState(), state.resources, [], [], Date.now());
    expect(result.justCompleted).toBeNull();
  });

  it('does nothing before the duration has elapsed', () => {
    const state = createInitialState();
    const process: Process = { id: 'c1', kind: 'certification', startedAt: 0, durationMs: 25 * MIN, payload: { testId: 'probe1Test1' } };
    const result = resolveCertification(makeState({ inProgress: process }), state.resources, [], [], 10 * MIN);
    expect(result.justCompleted).toBeNull();
    expect(result.certifications.inProgress).toBe(process);
  });

  it('probe1Test1 is a scripted failure: +30 XP, +250 Research (Flight Data), recovers 6 Hardware, fires N-07, unlocks the retry', () => {
    const state = createInitialState();
    state.resources.hardware.amount = 4; // e.g. what's left after the 10H the test consumed to start
    state.resources.hardware.byTier.aluminum = 4;
    state.resources.hardware.cap = 50;
    const process: Process = { id: 'c1', kind: 'certification', startedAt: 0, durationMs: 25 * MIN, payload: { testId: 'probe1Test1' } };

    const result = resolveCertification(makeState({ inProgress: process }), state.resources, [], [], 25 * MIN);

    expect(result.justCompleted).toEqual({ testId: 'probe1Test1', outcome: 'scriptedFailure' });
    expect(result.certifications.inProgress).toBeNull();
    expect(result.certifications.engines.probe1).toEqual({ attempted: true, certified: false, extendedCertified: false });
    expect(result.resources.hardware.amount).toBe(10); // 4 + 6 recovered
    expect(result.resources.flightxp.amount).toBe(30);
    expect(result.resources.research.amount).toBe(250); // Flight Data = Research
    expect(result.narrativeSeen).toEqual(['N-07']);
  });

  it('does not duplicate N-07 if it was already seen (idempotent)', () => {
    const state = createInitialState();
    const process: Process = { id: 'c1', kind: 'certification', startedAt: 0, durationMs: 25 * MIN, payload: { testId: 'probe1Test1' } };
    const result = resolveCertification(makeState({ inProgress: process }), state.resources, ['N-07'], [], 25 * MIN);
    expect(result.narrativeSeen).toEqual(['N-07']);
  });

  it('probe1Test2 is a guaranteed success: grants the static-fire-success reward and certifies the engine', () => {
    const state = createInitialState();
    const process: Process = { id: 'c1', kind: 'certification', startedAt: 0, durationMs: 25 * MIN, payload: { testId: 'probe1Test2' } };
    const result = resolveCertification(
      makeState({ inProgress: process, engines: { ...makeState().engines, probe1: engineState({ attempted: true }) } }),
      state.resources,
      [],
      [],
      25 * MIN,
    );

    expect(result.justCompleted).toEqual({ testId: 'probe1Test2', outcome: 'success' });
    expect(result.certifications.engines.probe1).toEqual({ attempted: true, certified: true, extendedCertified: false });
    expect(result.resources.flightxp.amount).toBe(15);
    expect(result.resources.reputation.amount).toBe(2);
    expect(result.resources.research.amount).toBe(150);
    expect(result.narrativeSeen).toEqual(['N-08']); // Certification success
  });

  it('probe1Extended grants no resource reward, only flips extendedCertified', () => {
    const state = createInitialState();
    const process: Process = { id: 'c1', kind: 'certification', startedAt: 0, durationMs: 25 * MIN, payload: { testId: 'probe1Extended' } };
    const result = resolveCertification(
      makeState({
        inProgress: process,
        engines: { ...makeState().engines, probe1: engineState({ attempted: true, certified: true }) },
      }),
      state.resources,
      [],
      [],
      25 * MIN,
    );

    expect(result.justCompleted).toEqual({ testId: 'probe1Extended', outcome: 'success' });
    expect(result.certifications.engines.probe1.extendedCertified).toBe(true);
    expect(result.resources).toBe(state.resources); // untouched — no reward
  });

  it('is purely timestamp-based: a huge jump in `now` resolves the same as checking incrementally', () => {
    const state = createInitialState();
    const process: Process = { id: 'c1', kind: 'certification', startedAt: 0, durationMs: 25 * MIN, payload: { testId: 'probe1Test1' } };
    const result = resolveCertification(makeState({ inProgress: process }), state.resources, [], [], 3 * 60 * MIN);
    expect(result.justCompleted).not.toBeNull();
  });

  describe('orbital1Base (ECONOMY §6: 80% success, probabilistic)', () => {
    const HOUR = 60 * MIN;

    it('success (roll under 0.8): grants the static-fire-success reward, certifies, narrates N-08', () => {
      const state = createInitialState();
      const process: Process = { id: 'c1', kind: 'certification', startedAt: 0, durationMs: 3 * HOUR, payload: { testId: 'orbital1Base', committedRoll: 0.5 } };
      const result = resolveCertification(makeState({ inProgress: process }), state.resources, [], [], 3 * HOUR);

      expect(result.justCompleted).toEqual({ testId: 'orbital1Base', outcome: 'success' });
      expect(result.certifications.engines.orbital1).toEqual({ attempted: true, certified: true, extendedCertified: false });
      expect(result.resources.flightxp.amount).toBe(15);
      expect(result.resources.reputation.amount).toBe(2);
      expect(result.resources.research.amount).toBe(150);
      expect(result.narrativeSeen).toEqual(['N-08']);
    });

    it('failure (roll at/over 0.8): +60 Flight XP only, attempted but not certified, no narrative beat', () => {
      const state = createInitialState();
      const process: Process = { id: 'c1', kind: 'certification', startedAt: 0, durationMs: 3 * HOUR, payload: { testId: 'orbital1Base', committedRoll: 0.85 } };
      const result = resolveCertification(makeState({ inProgress: process }), state.resources, [], [], 3 * HOUR);

      expect(result.justCompleted).toEqual({ testId: 'orbital1Base', outcome: 'failure' });
      expect(result.certifications.engines.orbital1).toEqual({ attempted: true, certified: false, extendedCertified: false });
      expect(result.resources.flightxp.amount).toBe(60);
      expect(result.resources.reputation.amount).toBe(0);
      expect(result.resources.research.amount).toBe(0);
      expect(result.narrativeSeen).toEqual([]);
    });

    it('the committedRoll drawn at start is what resolves the outcome, never a fresh draw at resolution', () => {
      const state = createInitialState();
      // Exactly at the 0.8 boundary counts as failure (roll < successRate is the success test).
      const process: Process = { id: 'c1', kind: 'certification', startedAt: 0, durationMs: 3 * HOUR, payload: { testId: 'orbital1Base', committedRoll: 0.8 } };
      const result = resolveCertification(makeState({ inProgress: process }), state.resources, [], [], 3 * HOUR);
      expect(result.justCompleted?.outcome).toBe('failure');
    });

    it('orbital1Retry becomes available after a failed base attempt, at half duration', () => {
      const engines = { ...createInitialState().certifications.engines, orbital1: { attempted: true, certified: false, extendedCertified: false } };
      expect(isCertificationTestAvailable(test('orbital1Retry'), engines.orbital1)).toBe(true);
      expect(test('orbital1Retry').durationMs).toBe(1.5 * HOUR);
      expect(test('orbital1Base').durationMs).toBe(3 * HOUR);
    });
  });
});
