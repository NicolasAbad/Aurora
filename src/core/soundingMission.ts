// ECONOMY §7a / GDD §6b+§7b: sounding rockets, "the full launch loop in miniature"
// (SPRINTS Sprint 6). Mirrors core/certification.ts's shape (a dedicated resolve
// function, one mission at a time) but is split into three stages because this mechanic
// has a real button-press resolution step the others don't (the dominant COUNTDOWN
// button) — see the header note on each function below.
import {
  FAILURE_FLIGHT_DATA_RATE,
  FAILURE_HARDWARE_RECOVERY_RATE,
  FAILURE_REINTEGRATION_DURATION_RATE,
  FAILURE_XP_RATE,
  SONDA_CONFIDENCE_BASE,
  SONDA_CONFIDENCE_CERTIFIED,
  SONDA_CONFIDENCE_EXTENDED_CERTIFIED,
  SONDA_CONFIDENCE_WEATHER,
  SOUNDING_ROCKETS,
  WEATHER_WINDOW_MAX_MS,
  WEATHER_WINDOW_MIN_MS,
} from '../data/soundingRockets';
import { CONTRACT_TIERS, TIER0_PAYLOAD_EXTRA_HARDWARE, TIER0_PAYLOAD_EXTRA_PROPELLANT } from '../data/contracts';
import { markSeen } from '../data/narrative';
import { applyGrant, trackingStationFlightXpMultiplier } from './economy';
import { recoveredPropellant } from './flightXp';
import { creditHardware, currentHardwareTier, spendHardware } from './hardware';
import { applyModifiers } from './modifiers';
import type {
  ContractState,
  EngineCertificationState,
  GameState,
  MissionState,
  Modifier,
  Process,
  SoundingRocketId,
} from './types';

const PROBE1_ENGINE_TECH = 'probe1Engine';

export function isSoundingRocketUnlocked(
  rocketId: SoundingRocketId,
  completedTech: string[],
  extendedRailBought: boolean,
): boolean {
  if (!completedTech.includes(PROBE1_ENGINE_TECH)) return false;
  const def = SOUNDING_ROCKETS[rocketId];
  return !def.requiresExtendedRail || extendedRailBought;
}

/** ECONOMY §7a simplified Sonda Confidence. Weather is one of the mandatory checklist
 * items (never "launch early" for a sonda, unlike the full 8-item formula), so it's
 * unconditionally included once this is computed against a mission that has one. */
export function computeSondaConfidence(engineState: EngineCertificationState): number {
  const certBonus = engineState.extendedCertified
    ? SONDA_CONFIDENCE_EXTENDED_CERTIFIED
    : engineState.certified
      ? SONDA_CONFIDENCE_CERTIFIED
      : 0;
  return Math.min(100, SONDA_CONFIDENCE_BASE + certBonus + SONDA_CONFIDENCE_WEATHER);
}

function requiredPropellant(rocketId: SoundingRocketId, contractId: string | null): number {
  const def = SOUNDING_ROCKETS[rocketId];
  return def.launchPropellant + (contractId ? TIER0_PAYLOAD_EXTRA_PROPELLANT : 0);
}

export interface StartSoundingAssemblyResult {
  resources: GameState['resources'];
  mission: MissionState;
  processes: Process[];
}

/**
 * Starts assembling `rocketId` at the Test Stand workshop (ECONOMY §4), if nothing else
 * is currently in flight. `contractId` links this specific build to an accepted tier-0
 * contract (ECONOMY §10: "all-inclusive cost" = the standard rocket + client payload
 * integration) — tier-0 only ever flies an S-1, so a non-null contractId on an S-2 is
 * refused. Pays Hardware upfront (same pay-now pattern as every other timed process
 * here); duration is halved if a previous failed flight of this same rocket type left a
 * re-integration bonus pending (GDD §7b), which this call consumes either way.
 */
export function startSoundingAssembly(
  resources: GameState['resources'],
  mission: MissionState,
  completedTech: string[],
  testStandBuilt: boolean,
  launchRailBuilt: boolean,
  extendedRailBought: boolean,
  engineState: EngineCertificationState,
  processes: Process[],
  rocketId: SoundingRocketId,
  contractId: string | null,
  now: number,
  modifiers: Modifier[] = [],
): StartSoundingAssemblyResult | null {
  if (mission.sounding) return null;
  if (!testStandBuilt || !launchRailBuilt) return null;
  if (!isSoundingRocketUnlocked(rocketId, completedTech, extendedRailBought)) return null;
  const def = SOUNDING_ROCKETS[rocketId];
  if (contractId && rocketId !== 's1') return null; // tier-0 contracts only ever fly an S-1 (ECONOMY §10)

  const hardwareCost = def.assemblyHardware + (contractId ? TIER0_PAYLOAD_EXTRA_HARDWARE : 0);
  if (resources.hardware.amount < hardwareCost) return null;

  const halfDuration = mission.soundingHalfDurationNext[rocketId] ?? false;
  // NARRATIVE §3 E-05: temporary +10% process-duration modifier, same generic query
  // every other process-starting function applies (default [] keeps every pre-Sprint-9
  // call site's exact old behavior — applyModifiers(x, [], ...) is always x).
  const durationMs =
    applyModifiers(def.assemblyDurationMs, modifiers, 'process.duration', now) *
    (halfDuration ? FAILURE_REINTEGRATION_DURATION_RATE : 1);

  return {
    resources: {
      ...resources,
      hardware: spendHardware(resources.hardware, hardwareCost),
    },
    mission: {
      ...mission,
      sounding: {
        rocketId,
        contractId,
        checklist: {
          assembled: false,
          propellantReady: false,
          weatherWindow: false,
          flightReview: rocketId === 's2' ? false : true, // inert-true for S-1 (ECONOMY §7a)
        },
        confidence: computeSondaConfidence(engineState),
        committedRoll: null,
      },
      soundingHalfDurationNext: { ...mission.soundingHalfDurationNext, [rocketId]: false },
    },
    processes: [
      ...processes,
      {
        id: `sounding-assembly-${rocketId}-${now}`,
        kind: 'integration',
        startedAt: now,
        durationMs,
        payload: { missionKind: 'sounding', rocketId, checklistItem: 'assembled' },
      },
    ],
  };
}

export interface StartWeatherCheckResult {
  mission: MissionState;
  processes: Process[];
}

/** Starts the weather-window timer for the in-progress sounding mission — ECONOMY §11:
 * uniform 2-5 min (no Weather Station until Sprint 7+, so always the full range here). */
export function startSoundingWeatherCheck(
  mission: MissionState,
  processes: Process[],
  now: number,
  randomFn: () => number = Math.random,
): StartWeatherCheckResult | null {
  if (!mission.sounding || mission.sounding.checklist.weatherWindow) return null;
  const alreadyRunning = processes.some(
    (p) => p.kind === 'weather_window' && p.payload.missionKind === 'sounding',
  );
  if (alreadyRunning) return null;

  const durationMs = WEATHER_WINDOW_MIN_MS + randomFn() * (WEATHER_WINDOW_MAX_MS - WEATHER_WINDOW_MIN_MS);
  return {
    mission,
    processes: [
      ...processes,
      {
        id: `sounding-weather-${now}`,
        kind: 'weather_window',
        startedAt: now,
        durationMs,
        payload: { missionKind: 'sounding', checklistItem: 'weatherWindow' },
      },
    ],
  };
}

/** Flips checklist items whose backing process (assembly or weather window) just
 * completed — mirrors core/actions.ts's applyCompletedProcesses, scoped to the sounding
 * mission's own two process-backed items. */
export function applyCompletedSoundingProcesses(
  mission: MissionState,
  completed: Process[],
): MissionState {
  if (!mission.sounding) return mission;
  let checklist = mission.sounding.checklist;
  for (const process of completed) {
    if (process.payload.missionKind !== 'sounding') continue;
    const item = process.payload.checklistItem as 'assembled' | 'weatherWindow' | undefined;
    if (item) checklist = { ...checklist, [item]: true };
  }
  if (checklist === mission.sounding.checklist) return mission;
  return { ...mission, sounding: { ...mission.sounding, checklist } };
}

const FLIGHT_REVIEW_COST_RESEARCH = 20; // ECONOMY §7a: S-2's flight review

export interface PaySoundingFlightReviewResult {
  resources: GameState['resources'];
  mission: MissionState;
}

/** ECONOMY §7: "pure Research spend, no timer" — S-2's extra checklist item. */
export function paySoundingFlightReview(
  resources: GameState['resources'],
  mission: MissionState,
): PaySoundingFlightReviewResult | null {
  if (!mission.sounding || mission.sounding.rocketId !== 's2') return null;
  if (mission.sounding.checklist.flightReview) return null;
  if (resources.research.amount < FLIGHT_REVIEW_COST_RESEARCH) return null;

  return {
    resources: {
      ...resources,
      research: { ...resources.research, amount: resources.research.amount - FLIGHT_REVIEW_COST_RESEARCH },
    },
    mission: {
      ...mission,
      sounding: { ...mission.sounding, checklist: { ...mission.sounding.checklist, flightReview: true } },
    },
  };
}

/**
 * Tick-time resolution (called every frame, like core/certification.ts's
 * resolveCertification): live-recomputes the `propellantReady` item and current
 * Confidence, then — rule 12 — draws and commits the roll the INSTANT every item is
 * simultaneously true, never waiting for the countdown button press. A no-op once
 * `committedRoll` is set (frozen from here on) or if there's no mission in progress.
 */
export function resolveSoundingChecklist(
  mission: MissionState,
  resources: GameState['resources'],
  engineState: EngineCertificationState,
  randomFn: () => number = Math.random,
  modifiers: Modifier[] = [],
  now = 0,
): MissionState {
  const sounding = mission.sounding;
  if (!sounding || sounding.committedRoll !== null) return mission;

  // ECONOMY §9: the live "ready" check must reflect Efficient mixtures' same discount
  // launchSoundingMission actually deducts, or a discounted player would be stuck unable
  // to complete a checklist item they've already fully paid for.
  const propellantReady =
    resources.propellant.amount >=
    applyModifiers(requiredPropellant(sounding.rocketId, sounding.contractId), modifiers, 'launch.propellant', now);
  const checklist = { ...sounding.checklist, propellantReady };
  const rawConfidence = computeSondaConfidence(engineState);
  // NARRATIVE §3 E-03 option B: one-shot "-10 Confidence next launch" — see
  // core/types.ts's MissionState.confidencePenaltyNext.
  const confidence = Math.max(0, rawConfidence - (mission.confidencePenaltyNext ?? 0));
  const complete = checklist.assembled && checklist.propellantReady && checklist.weatherWindow && checklist.flightReview;

  return {
    ...mission,
    sounding: { ...sounding, checklist, confidence, committedRoll: complete ? randomFn() : null },
    confidencePenaltyNext: complete ? undefined : mission.confidencePenaltyNext,
  };
}

export interface LaunchSoundingMissionResult {
  resources: GameState['resources'];
  mission: MissionState;
  contracts: ContractState;
  narrativeSeen: string[];
}

/**
 * The dominant COUNTDOWN button's action: resolves the ALREADY-COMMITTED roll (rule 12
 * — nothing is decided here, only revealed and applied) and resets the mission slot.
 * Failure resolution (GDD §7b, the general rule — the scripted Probe-1 failure's
 * hardcoded 6/10 H = 60% recovery confirms these numbers apply program-wide, not just to
 * Aurora I): 60% Hardware recovery, 80% success XP, 60% success Flight Data, next
 * re-assembly of the same rocket at 50% duration, no Reputation, no contract payout —
 * ECONOMY §10: a failed contract-linked flight does NOT cancel the contract, it just
 * stays active until its own deadline.
 */
export function launchSoundingMission(
  resources: GameState['resources'],
  mission: MissionState,
  contracts: ContractState,
  narrativeSeen: string[],
  completedTech: string[],
  now: number,
  modifiers: Modifier[] = [],
  xpNodesOwned: string[] = [],
  trackingLevel = 0,
  antennaNetworkBought = false,
): LaunchSoundingMissionResult | null {
  const sounding = mission.sounding;
  if (!sounding || sounding.committedRoll === null) return null;

  const def = SOUNDING_ROCKETS[sounding.rocketId];
  const tier = currentHardwareTier(completedTech);
  const success = sounding.committedRoll < sounding.confidence / 100;
  // ECONOMY §4/§9 (Sprint 10): see core/certification.ts for the same pattern.
  const xpMult = trackingStationFlightXpMultiplier(trackingLevel, antennaNetworkBought);
  const grantReputation = (amount: number) => applyModifiers(amount, modifiers, 'reputation.gain', now);
  // ECONOMY §9 (Sprint 10): Efficient mixtures' -10% Propellant/launch registers on
  // 'launch.propellant'.
  const propellantCost = applyModifiers(
    requiredPropellant(sounding.rocketId, sounding.contractId),
    modifiers,
    'launch.propellant',
    now,
  );

  let nextResources = {
    ...resources,
    propellant: { ...resources.propellant, amount: Math.max(0, resources.propellant.amount - propellantCost) },
  };
  // ECONOMY §9: Partial reusability — 20% of whatever Propellant was just spent credited
  // straight back (core/flightXp.ts).
  nextResources = {
    ...nextResources,
    propellant: applyGrant(nextResources.propellant, recoveredPropellant(propellantCost, xpNodesOwned), true),
  };
  let nextContracts = contracts;
  let nextNarrativeSeen = narrativeSeen;
  let halfDurationNext = mission.soundingHalfDurationNext[sounding.rocketId] ?? false;

  if (success) {
    nextResources = {
      ...nextResources,
      flightxp: applyGrant(nextResources.flightxp, def.successReward.flightxp * xpMult, true),
      reputation: applyGrant(nextResources.reputation, grantReputation(def.successReward.reputation), true),
      research: applyGrant(nextResources.research, def.successReward.flightData, true),
    };
    nextNarrativeSeen = markSeen(nextNarrativeSeen, def.narrativeIdOnSuccess);
    halfDurationNext = false;

    if (sounding.contractId) {
      const contractReward = CONTRACT_TIERS[0].reward;
      nextContracts = {
        ...nextContracts,
        active: nextContracts.active.map((a) =>
          a.offerId === sounding.contractId ? { ...a, fulfilled: true } : a,
        ),
      };
      nextResources = {
        ...nextResources,
        // ECONOMY §9: Trusted brand's +25% contract pay — funding only ("pay" reads as
        // the monetary reward, not XP/Rep/Flight Data).
        funding: applyGrant(nextResources.funding, applyModifiers(contractReward.funding, modifiers, 'contract.pay', now), true),
        reputation: applyGrant(nextResources.reputation, grantReputation(contractReward.reputation), true),
        // ECONOMY §8: "Contract fulfilled" pays its own Flight XP/Flight Data on top of
        // the underlying S-1 flight's own reward (already granted above).
        flightxp: applyGrant(nextResources.flightxp, contractReward.flightxp * xpMult, true),
        research: applyGrant(nextResources.research, contractReward.flightData, true),
      };
    }
  } else {
    nextResources = {
      ...nextResources,
      flightxp: applyGrant(nextResources.flightxp, def.successReward.flightxp * FAILURE_XP_RATE * xpMult, true),
      research: applyGrant(nextResources.research, def.successReward.flightData * FAILURE_FLIGHT_DATA_RATE, true),
      hardware: creditHardware(
        nextResources.hardware,
        def.assemblyHardware * FAILURE_HARDWARE_RECOVERY_RATE,
        tier,
        true,
      ),
    };
    halfDurationNext = true;
  }

  return {
    resources: nextResources,
    mission: {
      ...mission,
      sounding: null,
      soundingHalfDurationNext: { ...mission.soundingHalfDurationNext, [sounding.rocketId]: halfDurationNext },
      launches: [
        ...mission.launches,
        {
          id: `sounding-launch-${sounding.rocketId}-${now}`,
          padId: null,
          missionType: sounding.rocketId,
          success,
          timestamp: now,
          ...(sounding.contractId ? { contractId: sounding.contractId } : {}),
        },
      ],
    },
    contracts: nextContracts,
    narrativeSeen: nextNarrativeSeen,
  };
}
