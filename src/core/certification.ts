import { CERTIFICATION_TESTS_BY_ID, type CertificationTestDef } from '../data/certifications';
import { markSeen } from '../data/narrative';
import { applyGrant } from './economy';
import { creditHardware, currentHardwareTier } from './hardware';
import type { EngineCertificationState, EngineId, GameState, Process } from './types';

export interface CertificationState {
  engines: Record<EngineId, EngineCertificationState>;
  inProgress: Process | null;
}

// ECONOMY §6/§8 (v2.5). Scripted failure (Probe-1 test 1) is deterministic by design —
// GDD §7: "the FIRST static fire ALWAYS fails" — not a roll, so rule 12's committed-
// randomness concern doesn't apply here.
const SCRIPTED_FAILURE_HARDWARE_RECOVERY = 6;
const SCRIPTED_FAILURE_REWARD = { flightxp: 30, flightData: 250 };
const STATIC_FIRE_SUCCESS_REWARD = { flightxp: 15, reputation: 2, flightData: 150 };
const SCRIPTED_FAILURE_NARRATIVE_ID = 'N-07'; // First static fire failure
const CERTIFICATION_SUCCESS_NARRATIVE_ID = 'N-08'; // Certification success

/** Mirrors core/research.ts's isNodeAvailable shape: given the test's definition and its
 * engine's current progress, is this test startable right now? */
export function isCertificationTestAvailable(
  test: CertificationTestDef,
  engineState: EngineCertificationState,
): boolean {
  if (test.stage === 'extended') return engineState.certified && !engineState.extendedCertified;
  if (test.stage === 'first') return !engineState.attempted;
  return engineState.attempted && !engineState.certified; // 'retry'
}

export interface CertificationResolution {
  certifications: CertificationState;
  resources: GameState['resources'];
  narrativeSeen: string[];
  justCompleted: { testId: string; outcome: 'scriptedFailure' | 'success' } | null;
}

/**
 * Timestamp-based (CLAUDE.md rule 6), same pattern as core/research.ts's
 * resolveResearch: one test in progress at a time, resolved once `startedAt +
 * durationMs <= now`. Outcome is decided directly here by `stage` — Probe-1's three
 * tests are all deterministic (rule: "SCRIPTED FAILURE" / "guaranteed success" / always-
 * succeeds extended), so there's no probabilistic branch to build yet. Orbital-1's base
 * cert (Sprint 7) genuinely IS probabilistic (ECONOMY §6: "80% success") — that's a
 * different resolution shape (a committed roll, rule 12), deliberately not generalized
 * for here since Probe-1 alone doesn't need it.
 */
export function resolveCertification(
  certifications: CertificationState,
  resources: GameState['resources'],
  narrativeSeen: string[],
  completedTech: string[],
  now: number,
): CertificationResolution {
  const process = certifications.inProgress;
  if (!process || now < process.startedAt + process.durationMs) {
    return { certifications, resources, narrativeSeen, justCompleted: null };
  }

  const testId = process.payload.testId as string;
  const test = CERTIFICATION_TESTS_BY_ID.get(testId);
  if (!test) {
    // Can't happen via startCertification (payload always comes from a real test id) —
    // clear the stuck process rather than leaving it unresolvable forever.
    return {
      certifications: { ...certifications, inProgress: null },
      resources,
      narrativeSeen,
      justCompleted: null,
    };
  }

  const engineState = certifications.engines[test.engineId];

  if (test.stage === 'extended') {
    return {
      certifications: {
        engines: { ...certifications.engines, [test.engineId]: { ...engineState, extendedCertified: true } },
        inProgress: null,
      },
      resources,
      narrativeSeen,
      justCompleted: { testId, outcome: 'success' },
    };
  }

  if (test.stage === 'first') {
    const tier = currentHardwareTier(completedTech);
    return {
      certifications: {
        engines: { ...certifications.engines, [test.engineId]: { ...engineState, attempted: true } },
        inProgress: null,
      },
      resources: {
        ...resources,
        hardware: creditHardware(resources.hardware, SCRIPTED_FAILURE_HARDWARE_RECOVERY, tier, true),
        flightxp: applyGrant(resources.flightxp, SCRIPTED_FAILURE_REWARD.flightxp, true),
        research: applyGrant(resources.research, SCRIPTED_FAILURE_REWARD.flightData, true),
      },
      narrativeSeen: markSeen(narrativeSeen, SCRIPTED_FAILURE_NARRATIVE_ID),
      justCompleted: { testId, outcome: 'scriptedFailure' },
    };
  }

  // 'retry': Probe-1's test 2 — guaranteed success (ECONOMY §6), grants §8's "Static
  // fire success" reward and certifies the engine.
  return {
    certifications: {
      engines: {
        ...certifications.engines,
        [test.engineId]: { ...engineState, attempted: true, certified: true },
      },
      inProgress: null,
    },
    resources: {
      ...resources,
      flightxp: applyGrant(resources.flightxp, STATIC_FIRE_SUCCESS_REWARD.flightxp, true),
      reputation: applyGrant(resources.reputation, STATIC_FIRE_SUCCESS_REWARD.reputation, true),
      research: applyGrant(resources.research, STATIC_FIRE_SUCCESS_REWARD.flightData, true),
    },
    narrativeSeen: markSeen(narrativeSeen, CERTIFICATION_SUCCESS_NARRATIVE_ID),
    justCompleted: { testId, outcome: 'success' },
  };
}
