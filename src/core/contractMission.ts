// ECONOMY §10 v3.6 / GDD §6: satellite contracts (tier 1/2) share Aurora I's per-pad
// checklist/Confidence/roll-commitment machinery (core/auroraMission.ts) but build via a
// single "Payload integration" stage instead of Aurora's 5-stage VAB breakdown — see
// data/contracts.ts's SATELLITE_BUILD for why. Mirrors auroraMission.ts's shape (start
// stage / apply completed / weather / resolve checklist / launch) but scoped to
// contractId-tagged pads: a pad hosts either a story mission OR a contract mission at any
// one time (that exclusivity IS the "pad-queue tension" SPRINTS.md's acceptance criterion
// names), enforced by auroraMission.ts's own functions skipping any pad with
// PadMissionState.contractId set (see their guards) and this module only ever touching
// pads that already have it set, or are fully empty (rocketStatus: 'none').
import { AURORA_I_STAGES_BY_ID } from '../data/auroraI';
import { buildingForPad, EMPTY_CHECKLIST } from './auroraMission';
import { CONTRACT_PAYLOAD_STAGE_ID, CONTRACT_TIERS, SATELLITE_BUILD, type SatelliteBuildDef } from '../data/contracts';
import {
  FAILURE_FLIGHT_DATA_RATE,
  hardwareRecoveryRate,
  FAILURE_REINTEGRATION_DURATION_RATE,
  FAILURE_XP_RATE,
  WEATHER_WINDOW_MAX_MS,
  WEATHER_WINDOW_MIN_MS,
} from '../data/launch';
import { markSeen } from '../data/narrative';
import { canAffordCost, payCost } from './actions';
import { computeConfidenceBreakdown } from './confidence';
import { applyGrant, trackingStationFlightXpMultiplier } from './economy';
import { recoveredPropellant } from './flightXp';
import { creditHardware, currentHardwareTier } from './hardware';
import { applyModifiers } from './modifiers';
import { buildingStaffRatio } from './staff';
import type {
  ChecklistItemId,
  ContractState,
  EngineCertificationState,
  GameState,
  MissionState,
  Modifier,
  PadId,
  Process,
  ResourceId,
  StaffState,
} from './types';

type ContractStageId = 'payloadIntegration' | 'padTransfer' | 'propellantLoad' | 'flightReview';
const CONTRACT_STAGE_ORDER: ContractStageId[] = ['payloadIntegration', 'padTransfer', 'propellantLoad', 'flightReview'];

function nextContractStageId(stagesDone: string[]): ContractStageId | null {
  for (const id of CONTRACT_STAGE_ORDER) {
    if (!stagesDone.includes(id)) return id;
  }
  return null;
}

interface ContractStageDef {
  cost: Partial<Record<ResourceId, number>>;
  durationMs: number;
  minHardwareTier?: SatelliteBuildDef['minHardwareTier'];
}

// padTransfer/propellantLoad reuse Aurora I's own established timing (5 min / 3 min) —
// Option 1's explicit instruction — at the contract tier's own Propellant total instead
// of Aurora's fixed 400 P.
function contractStageDef(tier: 1 | 2, stageId: ContractStageId): ContractStageDef {
  const build = SATELLITE_BUILD[tier];
  switch (stageId) {
    case 'payloadIntegration':
      return { cost: { hardware: build.hardware }, durationMs: build.integrationDurationMs, minHardwareTier: build.minHardwareTier };
    case 'padTransfer':
      return { cost: {}, durationMs: AURORA_I_STAGES_BY_ID.get('padTransfer')!.durationMs };
    case 'propellantLoad':
      return { cost: { propellant: build.propellant }, durationMs: AURORA_I_STAGES_BY_ID.get('propellantLoad')!.durationMs };
    case 'flightReview':
      return { cost: {}, durationMs: 0 }; // free (Option 1) — §10 never listed a Research cost
  }
}

function rocketStatusAfterStarting(stageId: ContractStageId): 'integrating' | 'transferring' | 'on_pad' {
  if (stageId === 'payloadIntegration') return 'integrating';
  if (stageId === 'padTransfer') return 'transferring';
  return 'on_pad'; // propellantLoad / flightReview
}

function rocketStatusAfterCompleting(
  stageId: ContractStageId,
  previous: 'none' | 'integrating' | 'in_vab' | 'transferring' | 'on_pad',
): 'none' | 'integrating' | 'in_vab' | 'transferring' | 'on_pad' {
  if (stageId === 'payloadIntegration') return 'in_vab';
  if (stageId === 'padTransfer') return 'on_pad';
  return previous;
}

export interface StartContractStageResult {
  resources: GameState['resources'];
  mission: MissionState;
  processes: Process[];
  contracts: ContractState;
}

/**
 * Starts (or, for the 0-duration free flight review, instantly resolves) the next stage
 * of `offerId`'s payload on `padId`. `offerId` is passed on every call (not just the
 * first) — cheap to always supply from the UI, and lets this stay one function instead of
 * splitting "start fresh" from "continue" the way Aurora's single-mission-per-save shape
 * never had to. Refuses: pad occupied by anything else (story mission, a different
 * contract, or a stage already running on it), the contract isn't a currently-accepted
 * tier-1/2 offer, tier's Reputation gate or Clean Room prerequisite (tier 2) unmet (only
 * checked on the fresh-start stage — same "checked once, at the decisive moment" pattern
 * Aurora's own Engines-stage certification check uses), or the stage's cost is short.
 * Applies the same pad-level re-integration discount (GDD §7b) and process.duration event
 * modifier (NARRATIVE E-05) Aurora's own stage-starter applies.
 */
export function startNextContractStage(
  resources: GameState['resources'],
  mission: MissionState,
  contracts: ContractState,
  padId: PadId,
  offerId: string,
  processes: Process[],
  buildings: GameState['buildings'],
  completedTech: string[],
  modifiers: Modifier[],
  now: number,
  xpNodesOwned: string[] = [],
): StartContractStageResult | null {
  const pad = mission.pads[padId];
  if (!pad) return null;
  const alreadyRunning = processes.some((p) => p.payload.missionKind === 'contractPayload' && p.payload.padId === padId);
  if (alreadyRunning) return null;

  const freshStart = pad.contractId == null;
  if (freshStart) {
    if (pad.rocketStatus !== 'none') return null; // occupied by a story mission
    const activeContract = contracts.active.find((a) => a.offerId === offerId && !a.fulfilled && !a.deadlineMissed);
    if (!activeContract || activeContract.padId !== null) return null;
  } else if (pad.contractId !== offerId) {
    return null; // occupied by a different contract
  }

  const offer = contracts.offers.find((o) => o.id === offerId);
  if (!offer || (offer.tier !== 1 && offer.tier !== 2)) return null;
  const tier = offer.tier;
  const build = SATELLITE_BUILD[tier];

  if (freshStart) {
    if (resources.reputation.amount < build.reputationGate) return null;
    if (build.requiresCleanRoom && !buildings.vab.upgrades.includes('cleanRoom')) return null;
  }

  const stageId = nextContractStageId(pad.stagesDone);
  if (!stageId) return null;
  const rawDef = contractStageDef(tier, stageId);
  // ECONOMY §9 (Sprint 10): Efficient mixtures' -10% Propellant/launch — same
  // 'launch.propellant' target Aurora's own propellantLoad stage applies.
  const cost =
    stageId === 'propellantLoad' && rawDef.cost.propellant
      ? { ...rawDef.cost, propellant: applyModifiers(rawDef.cost.propellant, modifiers, 'launch.propellant', now) }
      : rawDef.cost;
  const def = { ...rawDef, cost };
  if (!canAffordCost(resources, def.cost, def.minHardwareTier)) return null;

  let nextResources = payCost(resources, def.cost, def.minHardwareTier);
  // ECONOMY §9: Partial reusability — 20% of whatever Propellant was just spent credited
  // straight back (core/flightXp.ts).
  if (stageId === 'propellantLoad' && def.cost.propellant) {
    nextResources = {
      ...nextResources,
      propellant: applyGrant(nextResources.propellant, recoveredPropellant(def.cost.propellant, xpNodesOwned), true),
    };
  }
  const halfDuration = mission.auroraHalfDurationNext?.[padId] ?? false;
  const autoRefuel = stageId === 'propellantLoad' && completedTech.includes('autoRefuel');
  const baseDurationMs =
    stageId === 'padTransfer'
      ? applyModifiers(def.durationMs, modifiers, 'transfer.duration', now)
      : stageId === 'payloadIntegration'
        ? applyModifiers(def.durationMs, modifiers, 'integration.duration', now) // ECONOMY §9: Procedures -10%
        : def.durationMs;
  const durationMs =
    applyModifiers(baseDurationMs, modifiers, 'process.duration', now) *
    (halfDuration ? FAILURE_REINTEGRATION_DURATION_RATE : 1) *
    (autoRefuel ? 0.5 : 1);

  const nextContracts: ContractState = freshStart
    ? { ...contracts, active: contracts.active.map((a) => (a.offerId === offerId ? { ...a, padId } : a)) }
    : contracts;

  if (def.durationMs === 0) {
    const stagesDone = [...pad.stagesDone, stageId];
    return {
      resources: nextResources,
      mission: {
        ...mission,
        pads: {
          ...mission.pads,
          [padId]: {
            ...pad,
            contractId: offerId,
            stagesDone,
            rocketStatus: rocketStatusAfterCompleting(stageId, pad.rocketStatus),
          },
        },
      },
      processes,
      contracts: nextContracts,
    };
  }

  return {
    resources: nextResources,
    mission: {
      ...mission,
      pads: {
        ...mission.pads,
        [padId]: { ...pad, contractId: offerId, rocketStatus: rocketStatusAfterStarting(stageId) },
      },
    },
    processes: [
      ...processes,
      {
        id: `contract-stage-${stageId}-${padId}-${now}`,
        kind: 'integration',
        startedAt: now,
        durationMs,
        payload: { missionKind: 'contractPayload', padId, stageId },
      },
    ],
    contracts: nextContracts,
  };
}

/** Flips `stagesDone`/`rocketStatus` for whichever pad's contract stage just completed —
 * mirrors core/auroraMission.ts's applyCompletedAuroraStages. */
export function applyCompletedContractStages(mission: MissionState, completed: Process[]): MissionState {
  let pads = mission.pads;
  for (const process of completed) {
    if (process.payload.missionKind !== 'contractPayload') continue;
    const padId = process.payload.padId as PadId;
    const stageId = process.payload.stageId as ContractStageId;
    const pad = pads[padId];
    if (!pad || pad.stagesDone.includes(stageId)) continue;
    const stagesDone = [...pad.stagesDone, stageId];
    pads = { ...pads, [padId]: { ...pad, stagesDone, rocketStatus: rocketStatusAfterCompleting(stageId, pad.rocketStatus) } };
  }
  if (pads === mission.pads) return mission;
  return { ...mission, pads };
}

export interface StartContractWeatherResult {
  mission: MissionState;
  processes: Process[];
}

export function startContractWeatherCheck(
  mission: MissionState,
  padId: PadId,
  processes: Process[],
  now: number,
  randomFn: () => number = Math.random,
): StartContractWeatherResult | null {
  const pad = mission.pads[padId];
  if (!pad || pad.contractId == null || pad.checklist.weatherWindow) return null;
  const alreadyRunning = processes.some(
    (p) => p.kind === 'weather_window' && p.payload.missionKind === 'contractPayload' && p.payload.padId === padId,
  );
  if (alreadyRunning) return null;

  const durationMs = WEATHER_WINDOW_MIN_MS + randomFn() * (WEATHER_WINDOW_MAX_MS - WEATHER_WINDOW_MIN_MS);
  return {
    mission,
    processes: [
      ...processes,
      {
        id: `contract-weather-${padId}-${now}`,
        kind: 'weather_window',
        startedAt: now,
        durationMs,
        payload: { missionKind: 'contractPayload', padId, checklistItem: 'weatherWindow' },
      },
    ],
  };
}

export function applyCompletedContractWeather(mission: MissionState, completed: Process[]): MissionState {
  let pads = mission.pads;
  for (const process of completed) {
    if (process.kind !== 'weather_window' || process.payload.missionKind !== 'contractPayload') continue;
    const padId = process.payload.padId as PadId;
    const pad = pads[padId];
    if (!pad) continue;
    pads = { ...pads, [padId]: { ...pad, checklist: { ...pad.checklist, weatherWindow: true } } };
  }
  if (pads === mission.pads) return mission;
  return { ...mission, pads };
}

/**
 * Tick-time resolution, mirrors core/auroraMission.ts's resolveAuroraChecklist: recomputes
 * the checklist and Confidence, then draws and commits the roll (rule 12) the instant all
 * 8 items are simultaneously true. Applies and clears NARRATIVE E-03's one-shot "-10
 * Confidence next launch" flag (core/types.ts's MissionState.confidencePenaltyNext) — the
 * first mission of ANY kind (sounding/Aurora/contract) to commit a roll consumes it.
 */
export function resolveContractChecklist(
  mission: MissionState,
  padId: PadId,
  buildings: GameState['buildings'],
  staff: StaffState,
  engineState: EngineCertificationState,
  flightXp: number,
  randomFn: () => number = Math.random,
): MissionState {
  const pad = mission.pads[padId];
  if (!pad || pad.contractId == null || pad.committedRoll !== null) return mission;

  const checklist: Record<ChecklistItemId, boolean> = {
    rocketIntegrated: pad.stagesDone.includes(CONTRACT_PAYLOAD_STAGE_ID),
    enginesCertified: engineState.certified,
    transferToPad: pad.stagesDone.includes('padTransfer'),
    propellantLoaded: pad.stagesDone.includes('propellantLoad'),
    flightReview: pad.stagesDone.includes('flightReview'),
    controllersOnStation: buildingStaffRatio(staff, 'launchControl', buildings.launchControl.level) >= 1,
    trackingActive: buildings.trackingStation.level >= 1,
    weatherWindow: pad.checklist.weatherWindow,
  };
  const allDone = (Object.values(checklist) as boolean[]).every(Boolean);

  const rawConfidence = computeConfidenceBreakdown({
    engineState,
    flightReviewApproved: checklist.flightReview,
    controllersFullyStaffed: checklist.controllersOnStation,
    serviceTowerBuilt: buildings[buildingForPad(padId)].upgrades.includes('serviceTower'),
    weatherResolved: checklist.weatherWindow,
    flightXp,
  }).total;
  const confidence = Math.max(0, rawConfidence - (mission.confidencePenaltyNext ?? 0));

  return {
    ...mission,
    pads: { ...mission.pads, [padId]: { ...pad, checklist, confidence, committedRoll: allDone ? randomFn() : null } },
    confidencePenaltyNext: allDone ? undefined : mission.confidencePenaltyNext,
  };
}

export interface LaunchContractMissionResult {
  resources: GameState['resources'];
  mission: MissionState;
  contracts: ContractState;
  narrativeSeen: string[];
}

/**
 * The dominant COUNTDOWN button's action for a contract-linked pad: resolves the
 * already-committed roll. Success pays ONLY the contract's own tier reward (ECONOMY §8 —
 * there is no separate "satellite launch" base reward the way sondas/Aurora I have their
 * own §8 row; "Contract fulfilled" IS the full reward for a satellite contract) and marks
 * the contract fulfilled. Failure applies GDD §7b's general failure package, scaled off
 * the CONTRACT's own reward (same "80%/60% of that mission's success XP/Flight Data"
 * reading tier-0 already established) and Hardware recovered from what integration spent
 * — the contract stays active, not cancelled, per ECONOMY §10's explicit rule, freed to
 * retry on any pad (padId reset to null).
 */
export function launchContractMission(
  resources: GameState['resources'],
  mission: MissionState,
  contracts: ContractState,
  padId: PadId,
  narrativeSeen: string[],
  completedTech: string[],
  now: number,
  modifiers: Modifier[] = [],
  trackingLevel = 0,
  antennaNetworkBought = false,
): LaunchContractMissionResult | null {
  const pad = mission.pads[padId];
  if (!pad || pad.contractId == null || pad.committedRoll === null) return null;

  const offerId = pad.contractId;
  const offer = contracts.offers.find((o) => o.id === offerId);
  if (!offer || (offer.tier !== 1 && offer.tier !== 2)) return null;
  const tier = offer.tier;
  const reward = CONTRACT_TIERS[tier].reward;
  const build = SATELLITE_BUILD[tier];
  const hwTier = currentHardwareTier(completedTech);

  const success = pad.committedRoll < pad.confidence / 100;
  // ECONOMY §4/§9 (Sprint 10): see core/certification.ts for the same pattern.
  const xpMult = trackingStationFlightXpMultiplier(trackingLevel, antennaNetworkBought);
  const grantReputation = (amount: number) => applyModifiers(amount, modifiers, 'reputation.gain', now);
  let nextResources = resources;
  let nextNarrativeSeen = narrativeSeen;
  const halfDurationNext = { ...mission.auroraHalfDurationNext };

  if (success) {
    nextResources = {
      ...nextResources,
      // ECONOMY §9: Trusted brand's +25% contract pay — funding only.
      funding: applyGrant(nextResources.funding, applyModifiers(reward.funding, modifiers, 'contract.pay', now), true),
      reputation: applyGrant(nextResources.reputation, grantReputation(reward.reputation), true),
      flightxp: applyGrant(nextResources.flightxp, reward.flightxp * xpMult, true),
      research: applyGrant(nextResources.research, reward.flightData, true),
    };
    nextNarrativeSeen = markSeen(nextNarrativeSeen, 'N-14'); // First contract fulfilled (idempotent if not first)
    halfDurationNext[padId] = false;
  } else {
    // No dedicated failure-narrative id for a contract satellite (N-12 is Aurora I's own
    // "First successful launch" pairing) — same restraint as Orbital-1's own non-"first"
    // failure case (core/certification.ts's ORBITAL1_FAILURE_FLIGHT_XP comment).
    nextResources = {
      ...nextResources,
      flightxp: applyGrant(nextResources.flightxp, reward.flightxp * FAILURE_XP_RATE * xpMult, true),
      research: applyGrant(nextResources.research, reward.flightData * FAILURE_FLIGHT_DATA_RATE, true),
      hardware: creditHardware(nextResources.hardware, build.hardware * hardwareRecoveryRate(completedTech), hwTier, true),
    };
    halfDurationNext[padId] = true;
  }

  const nextContracts: ContractState = {
    ...contracts,
    active: contracts.active.map((a) =>
      a.offerId === offerId ? { ...a, fulfilled: success ? true : a.fulfilled, padId: null } : a,
    ),
  };

  return {
    resources: nextResources,
    mission: {
      ...mission,
      pads: {
        ...mission.pads,
        [padId]: { rocketStatus: 'none', stagesDone: [], checklist: { ...EMPTY_CHECKLIST }, confidence: 0, committedRoll: null, contractId: null },
      },
      auroraHalfDurationNext: halfDurationNext,
      launches: [
        ...mission.launches,
        { id: `contract-launch-${padId}-${now}`, padId, missionType: 'contract', success, timestamp: now, contractId: offerId },
      ],
    },
    contracts: nextContracts,
    narrativeSeen: nextNarrativeSeen,
  };
}

export interface ResolveContractMissionTickResult {
  mission: MissionState;
}

/** The per-tick composition (called from state/persistStore.ts alongside resolveAuroraTick):
 * applies whatever contract stage/weather processes just completed, then live-resolves
 * every contractId-tagged pad's checklist. No auto-queue equivalent to Aurora's
 * "vabQueues" tech — each contract stage is always a manual click, same as a story
 * mission without that tech researched. */
export function resolveContractMissionTick(
  mission: MissionState,
  buildings: GameState['buildings'],
  staff: StaffState,
  engineState: EngineCertificationState,
  flightXp: number,
  completedProcesses: Process[],
): ResolveContractMissionTickResult {
  let nextMission = applyCompletedContractStages(mission, completedProcesses);
  nextMission = applyCompletedContractWeather(nextMission, completedProcesses);

  for (const padId of Object.keys(nextMission.pads) as PadId[]) {
    if (nextMission.pads[padId]?.contractId == null) continue;
    nextMission = resolveContractChecklist(nextMission, padId, buildings, staff, engineState, flightXp);
  }

  return { mission: nextMission };
}
