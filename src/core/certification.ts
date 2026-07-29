import { CERTIFICATION_TESTS_BY_ID, type CertificationTestDef } from '../data/certifications';
import { markSeen } from '../data/narrative';
import { applyGrant, trackingStationFlightXpMultiplier } from './economy';
import { creditHardware, currentHardwareTier } from './hardware';
import { applyModifiers } from './modifiers';
import type { EngineCertificationState, EngineId, GameState, Modifier, Process } from './types';

export interface CertificationState {
  engines: Record<EngineId, EngineCertificationState>;
  inProgress: Process | null;
}

// ECONOMY §6/§8 (v2.5). Scripted failure (Probe-1 test 1) is deterministic by design —
// GDD §7: "the FIRST static fire ALWAYS fails" — not a roll, so rule 12's committed-
// randomness concern doesn't apply here.
// Exported so sim/run.ts can import these instead of keeping a second hardcoded copy
// (same "point the simulator at the real data" pattern as everywhere else).
export const SCRIPTED_FAILURE_HARDWARE_RECOVERY = 6;
export const SCRIPTED_FAILURE_REWARD = { flightxp: 30, flightData: 250 };
export const STATIC_FIRE_SUCCESS_REWARD = { flightxp: 15, reputation: 2, flightData: 150 };
const SCRIPTED_FAILURE_NARRATIVE_ID = 'N-07'; // First static fire failure
// NARRATIVE_EVENTS §1's trigger for N-08 is worded generically ("Certification
// success"), not "Probe-1 certification success" — reused as-is for Orbital-1's
// success too (ECONOMY §6), rather than inventing a second string (rule 9). If Orbital-1
// certifies after Probe-1 already has, markSeen is idempotent, so no second Mission Log
// entry appears — an accepted consequence of the generic trigger match, not a bug.
const CERTIFICATION_SUCCESS_NARRATIVE_ID = 'N-08'; // Certification success
// ECONOMY §6: Orbital-1's failure reward is narrower than Probe-1's scripted one — only
// Flight XP is specified (no Hardware recovery, no Flight Data, no Reputation), and it's
// not a "first" moment in the narrative sense (repeatable, not scripted), so no
// NARRATIVE_EVENTS id applies — no beat fires for it.
export const ORBITAL1_FAILURE_FLIGHT_XP = 60;

// ECONOMY §4 v3.5 (Sprint 7.5 SCOPED UNLOCK): Test Stand leveling had no effect at all
// before this — a real gap, not player error. "Each level beyond 1: -3% certification
// duration, stacking multiplicatively with the Instrumentation upgrade." Instrumentation
// itself (NARRATIVE U-04: "-25% faster") was ALSO never wired anywhere in code (grepped —
// dead narrative text) despite the doc treating it as already-established; both are fixed
// together here since "stacking with Instrumentation" can't be implemented correctly
// without Instrumentation's own effect existing first. Internal-upgrade effects in this
// codebase are checked directly at their point of use rather than routed through
// core/modifiers.ts (same precedent as confidence.ts's Service Tower check) — the
// Modifier registry is reserved for research-tree effects (every existing registered
// Modifier comes from data/researchTree.ts).
export const TEST_STAND_DURATION_REDUCTION_PER_LEVEL = 0.03;
const INSTRUMENTATION_DURATION_MULT = 0.75;

/** Linear (not compounding) per-level reduction, matching this codebase's other
 * per-level effects (`base * level`, never `base ^ level`) — level 1 = no reduction
 * ("beyond 1"), level 5 = -12%. Stacks multiplicatively with Instrumentation, per §4 v3.5. */
export function certificationDurationMultiplier(testStandLevel: number, instrumentationBought: boolean): number {
  const levelMult = Math.max(0, 1 - TEST_STAND_DURATION_REDUCTION_PER_LEVEL * Math.max(0, testStandLevel - 1));
  return instrumentationBought ? levelMult * INSTRUMENTATION_DURATION_MULT : levelMult;
}

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
  justCompleted: { testId: string; outcome: 'scriptedFailure' | 'success' | 'failure' } | null;
}

/**
 * Timestamp-based (CLAUDE.md rule 6), same pattern as core/research.ts's
 * resolveResearch: one test in progress at a time, resolved once `startedAt +
 * durationMs <= now`. Deterministic tests (Probe-1's three) are dispatched by `stage`
 * alone. A probabilistic test (Orbital-1's 'first'/'retry', ECONOMY §6: "80% success")
 * is dispatched by `test.successRate` instead, reading the roll committed at process
 * START (rule 12) rather than drawing a fresh one here.
 */
export function resolveCertification(
  certifications: CertificationState,
  resources: GameState['resources'],
  narrativeSeen: string[],
  completedTech: string[],
  now: number,
  modifiers: Modifier[] = [],
  trackingLevel = 0,
  antennaNetworkBought = false,
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
  // ECONOMY §4/§9 (Sprint 10): Tracking Station's level+Antenna-Network Flight XP
  // multiplier and Public relations' 'reputation.gain' modifier, applied at every reward
  // grant below — see core/economy.ts's trackingStationFlightXpMultiplier.
  const xpMult = trackingStationFlightXpMultiplier(trackingLevel, antennaNetworkBought);
  const grantReputation = (amount: number) => applyModifiers(amount, modifiers, 'reputation.gain', now);

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

  if (test.successRate !== undefined) {
    // Orbital-1-style probabilistic cert (ECONOMY §6). committedRoll was drawn and
    // stored at process START (core/actions.ts's startCertification) — read, never
    // redrawn, here.
    const committedRoll = process.payload.committedRoll as number;
    const success = committedRoll < test.successRate;

    if (success) {
      return {
        certifications: {
          engines: { ...certifications.engines, [test.engineId]: { ...engineState, attempted: true, certified: true } },
          inProgress: null,
        },
        resources: {
          ...resources,
          flightxp: applyGrant(resources.flightxp, STATIC_FIRE_SUCCESS_REWARD.flightxp * xpMult, true),
          reputation: applyGrant(resources.reputation, grantReputation(STATIC_FIRE_SUCCESS_REWARD.reputation), true),
          research: applyGrant(resources.research, STATIC_FIRE_SUCCESS_REWARD.flightData, true),
        },
        narrativeSeen: markSeen(narrativeSeen, CERTIFICATION_SUCCESS_NARRATIVE_ID),
        justCompleted: { testId, outcome: 'success' },
      };
    }

    return {
      certifications: {
        engines: { ...certifications.engines, [test.engineId]: { ...engineState, attempted: true } },
        inProgress: null,
      },
      resources: { ...resources, flightxp: applyGrant(resources.flightxp, ORBITAL1_FAILURE_FLIGHT_XP * xpMult, true) },
      narrativeSeen,
      justCompleted: { testId, outcome: 'failure' },
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
        flightxp: applyGrant(resources.flightxp, SCRIPTED_FAILURE_REWARD.flightxp * xpMult, true),
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
      flightxp: applyGrant(resources.flightxp, STATIC_FIRE_SUCCESS_REWARD.flightxp * xpMult, true),
      reputation: applyGrant(resources.reputation, grantReputation(STATIC_FIRE_SUCCESS_REWARD.reputation), true),
      research: applyGrant(resources.research, STATIC_FIRE_SUCCESS_REWARD.flightData, true),
    },
    narrativeSeen: markSeen(narrativeSeen, CERTIFICATION_SUCCESS_NARRATIVE_ID),
    justCompleted: { testId, outcome: 'success' },
  };
}
