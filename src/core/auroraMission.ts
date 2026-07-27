// GDD §7 / ECONOMY §7: Aurora I, "the full launch loop" (the sonda loop from Sprint 6
// was its miniature). Mirrors core/soundingMission.ts's three-stage split (start action /
// process-completion dispatcher / tick-time checklist+roll resolution / explicit launch
// action) but against PadMissionState's 8-item checklist instead of the simplified 3-4.
import {
  AURORA_I_REWARD,
  AURORA_I_STAGES_BY_ID,
  VAB_STAGE_IDS,
  type AuroraStageId,
} from '../data/auroraI';
import {
  FAILURE_FLIGHT_DATA_RATE,
  FAILURE_HARDWARE_RECOVERY_RATE,
  FAILURE_REINTEGRATION_DURATION_RATE,
  FAILURE_XP_RATE,
  WEATHER_WINDOW_MAX_MS,
  WEATHER_WINDOW_MIN_MS,
} from '../data/launch';
import { markSeen } from '../data/narrative';
import { canAffordCost, payCost } from './actions';
import { computeConfidenceBreakdown } from './confidence';
import { applyGrant } from './economy';
import { creditHardware, currentHardwareTier } from './hardware';
import { applyModifiers } from './modifiers';
import { buildingStaffRatio } from './staff';
import type {
  ChecklistItemId,
  EngineCertificationState,
  GameState,
  MissionState,
  Modifier,
  PadId,
  PadMissionState,
  Process,
  StaffState,
} from './types';

const EMPTY_CHECKLIST: Record<ChecklistItemId, boolean> = {
  rocketIntegrated: false,
  enginesCertified: false,
  transferToPad: false,
  propellantLoaded: false,
  flightReview: false,
  controllersOnStation: false,
  trackingActive: false,
  weatherWindow: false,
};

/** Next stage in ECONOMY §7's strict sequential chain, or null once all 8 are done. */
export function nextAuroraStageId(stagesDone: string[]): AuroraStageId | null {
  for (const id of AURORA_I_STAGES_BY_ID.keys()) {
    if (!stagesDone.includes(id)) return id;
  }
  return null;
}

function rocketStatusAfterStarting(stageId: AuroraStageId): PadMissionState['rocketStatus'] {
  if ((VAB_STAGE_IDS as string[]).includes(stageId)) return 'integrating';
  if (stageId === 'padTransfer') return 'transferring';
  return 'on_pad'; // propellantLoad / flightReview
}

function rocketStatusAfterCompleting(stageId: AuroraStageId, previous: PadMissionState['rocketStatus']): PadMissionState['rocketStatus'] {
  if (stageId === 'finalIntegration') return 'in_vab';
  if (stageId === 'padTransfer') return 'on_pad';
  return previous;
}

export interface StartAuroraStageResult {
  resources: GameState['resources'];
  mission: MissionState;
  processes: Process[];
}

// ECONOMY §5 v3.5 (Sprint 7.5 SCOPED UNLOCK): "-50% propellant loading duration for
// satellite-class missions" — previously undefined, a real gap. Sonda Propellant is a
// live check, not timed (v3.4), so this only ever applies to the propellantLoad stage.
const AUTO_REFUEL_DURATION_MULT = 0.5;

/**
 * Starts (or, for the 0-duration Flight Review, instantly resolves) the next stage in
 * sequence for `padId`. The "Engines" stage additionally requires Orbital-1 already
 * certified (ECONOMY §7: "Engines (Orbital-1 certified)"). Pays cost upfront, same
 * pattern as every other timed process in this codebase. Applies the pending
 * re-integration discount (GDD §7b) if this pad has one — see `mission.auroraHalfDurationNext`
 * — Auto-refuel's propellant-loading discount (ECONOMY §5 v3.5), and Basic logistics'
 * -25% pad-transfer-time modifier (`transfer.duration`, ECONOMY §5 — registered on
 * research completion since Sprint 4 but never actually queried anywhere until this
 * Sprint 7.5 follow-up SCOPED UNLOCK), stacked multiplicatively when more than one
 * happens to apply at once. `modifiers` is queried as it stood BEFORE this tick's own
 * resolution — same "a modifier only takes effect the moment it's registered" precedent
 * `offline.capMs`'s query already established (state/persistStore.ts).
 */
export function startNextAuroraStage(
  resources: GameState['resources'],
  mission: MissionState,
  padId: PadId,
  processes: Process[],
  engineState: EngineCertificationState,
  completedTech: string[],
  modifiers: Modifier[],
  now: number,
): StartAuroraStageResult | null {
  const pad = mission.pads[padId];
  if (!pad) return null;
  const alreadyRunning = processes.some((p) => p.payload.missionKind === 'auroraI' && p.payload.padId === padId);
  if (alreadyRunning) return null;

  const stageId = nextAuroraStageId(pad.stagesDone);
  if (!stageId) return null;
  if (stageId === 'engines' && !engineState.certified) return null;

  const stageDef = AURORA_I_STAGES_BY_ID.get(stageId)!;
  if (!canAffordCost(resources, stageDef.cost)) return null;

  const nextResources = payCost(resources, stageDef.cost);
  const halfDuration = mission.auroraHalfDurationNext?.[padId] ?? false;
  const autoRefuel = stageId === 'propellantLoad' && completedTech.includes('autoRefuel');
  const baseDurationMs =
    stageId === 'padTransfer'
      ? applyModifiers(stageDef.durationMs, modifiers, 'transfer.duration', now)
      : stageDef.durationMs;
  const durationMs =
    baseDurationMs *
    (halfDuration ? FAILURE_REINTEGRATION_DURATION_RATE : 1) *
    (autoRefuel ? AUTO_REFUEL_DURATION_MULT : 1);

  if (stageDef.durationMs === 0) {
    // Flight Review (ECONOMY §7: "pure Research spend, no timer") — resolved instantly,
    // no process, same instant-spend pattern as the sonda's own flight review.
    const stagesDone = [...pad.stagesDone, stageId];
    return {
      resources: nextResources,
      mission: {
        ...mission,
        pads: {
          ...mission.pads,
          [padId]: { ...pad, stagesDone, rocketStatus: rocketStatusAfterCompleting(stageId, pad.rocketStatus) },
        },
      },
      processes,
    };
  }

  return {
    resources: nextResources,
    mission: {
      ...mission,
      pads: { ...mission.pads, [padId]: { ...pad, rocketStatus: rocketStatusAfterStarting(stageId) } },
    },
    processes: [
      ...processes,
      {
        id: `aurora-stage-${stageId}-${padId}-${now}`,
        kind: 'integration',
        startedAt: now,
        durationMs,
        payload: { missionKind: 'auroraI', padId, stageId },
      },
    ],
  };
}

/** GDD's "VAB queues" auto-progression (research tree: vabQueues) — auto-starts the next
 * stage the instant one finishes, but only within the VAB itself (transfer/propellant/
 * flight review always stay manual, deliberate decision points). No-op (returns the
 * inputs unchanged) if the tech isn't researched, a stage is already running, or the
 * next stage isn't a VAB one. */
export function maybeAutoQueueAuroraStage(
  resources: GameState['resources'],
  mission: MissionState,
  padId: PadId,
  processes: Process[],
  engineState: EngineCertificationState,
  completedTech: string[],
  modifiers: Modifier[],
  now: number,
): StartAuroraStageResult {
  const unchanged = { resources, mission, processes };
  if (!completedTech.includes('vabQueues')) return unchanged;
  const pad = mission.pads[padId];
  if (!pad) return unchanged;
  const stageId = nextAuroraStageId(pad.stagesDone);
  if (!stageId || !(VAB_STAGE_IDS as string[]).includes(stageId)) return unchanged;

  return startNextAuroraStage(resources, mission, padId, processes, engineState, completedTech, modifiers, now) ?? unchanged;
}

/** Flips `stagesDone`/`rocketStatus` for whichever pad's stage just completed — mirrors
 * core/soundingMission.ts's applyCompletedSoundingProcesses. */
export function applyCompletedAuroraStages(mission: MissionState, completed: Process[]): MissionState {
  let pads = mission.pads;
  for (const process of completed) {
    if (process.payload.missionKind !== 'auroraI') continue;
    const padId = process.payload.padId as PadId;
    const stageId = process.payload.stageId as AuroraStageId;
    const pad = pads[padId];
    if (!pad || pad.stagesDone.includes(stageId)) continue;
    const stagesDone = [...pad.stagesDone, stageId];
    pads = { ...pads, [padId]: { ...pad, stagesDone, rocketStatus: rocketStatusAfterCompleting(stageId, pad.rocketStatus) } };
  }
  if (pads === mission.pads) return mission;
  return { ...mission, pads };
}

export interface StartWeatherCheckResult {
  mission: MissionState;
  processes: Process[];
}

export function startAuroraWeatherCheck(
  mission: MissionState,
  padId: PadId,
  processes: Process[],
  now: number,
  randomFn: () => number = Math.random,
): StartWeatherCheckResult | null {
  const pad = mission.pads[padId];
  if (!pad || pad.checklist.weatherWindow) return null;
  const alreadyRunning = processes.some(
    (p) => p.kind === 'weather_window' && p.payload.missionKind === 'auroraI' && p.payload.padId === padId,
  );
  if (alreadyRunning) return null;

  const durationMs = WEATHER_WINDOW_MIN_MS + randomFn() * (WEATHER_WINDOW_MAX_MS - WEATHER_WINDOW_MIN_MS);
  return {
    mission,
    processes: [
      ...processes,
      {
        id: `aurora-weather-${padId}-${now}`,
        kind: 'weather_window',
        startedAt: now,
        durationMs,
        payload: { missionKind: 'auroraI', padId, checklistItem: 'weatherWindow' },
      },
    ],
  };
}

/** Flips a pad's weatherWindow checklist item once its process resolves — separate from
 * applyCompletedAuroraStages since weather isn't one of the 8 AURORA_I_STAGES. */
export function applyCompletedAuroraWeather(mission: MissionState, completed: Process[]): MissionState {
  let pads = mission.pads;
  for (const process of completed) {
    if (process.kind !== 'weather_window' || process.payload.missionKind !== 'auroraI') continue;
    const padId = process.payload.padId as PadId;
    const pad = pads[padId];
    if (!pad) continue;
    pads = { ...pads, [padId]: { ...pad, checklist: { ...pad.checklist, weatherWindow: true } } };
  }
  if (pads === mission.pads) return mission;
  return { ...mission, pads };
}

/**
 * Tick-time resolution (mirrors core/soundingMission.ts's resolveSoundingChecklist):
 * live-recomputes the checklist's two pure-staffing/building gates (Controllers,
 * Tracking) and the stage-derived items, then — per the ratified all-8-mandatory model
 * (GDD v2.10) — draws and commits the roll (rule 12) the instant all 8 are
 * simultaneously true. A no-op once committedRoll is set or if there's no mission on
 * this pad.
 */
export function resolveAuroraChecklist(
  mission: MissionState,
  padId: PadId,
  buildings: GameState['buildings'],
  staff: StaffState,
  engineState: EngineCertificationState,
  flightXp: number,
  randomFn: () => number = Math.random,
): MissionState {
  const pad = mission.pads[padId];
  if (!pad || pad.committedRoll !== null) return mission;

  const checklist: Record<ChecklistItemId, boolean> = {
    rocketIntegrated: VAB_STAGE_IDS.every((id) => pad.stagesDone.includes(id)),
    enginesCertified: engineState.certified,
    transferToPad: pad.stagesDone.includes('padTransfer'),
    propellantLoaded: pad.stagesDone.includes('propellantLoad'),
    flightReview: pad.stagesDone.includes('flightReview'),
    controllersOnStation: buildingStaffRatio(staff, 'launchControl', buildings.launchControl.level) >= 1,
    trackingActive: buildings.trackingStation.level >= 1,
    weatherWindow: pad.checklist.weatherWindow, // process-latched, not live-derived
  };
  const allDone = (Object.values(checklist) as boolean[]).every(Boolean);

  const confidence = computeConfidenceBreakdown({
    engineState,
    flightReviewApproved: checklist.flightReview,
    controllersFullyStaffed: checklist.controllersOnStation,
    serviceTowerBuilt: buildings.launchPad.upgrades.includes('serviceTower'),
    weatherResolved: checklist.weatherWindow,
    flightXp,
  }).total;

  return {
    ...mission,
    pads: {
      ...mission.pads,
      [padId]: { ...pad, checklist, confidence, committedRoll: allDone ? randomFn() : null },
    },
  };
}

export interface LaunchAuroraMissionResult {
  resources: GameState['resources'];
  mission: MissionState;
  narrativeSeen: string[];
}

/**
 * The dominant COUNTDOWN button's action (mirrors core/soundingMission.ts's
 * launchSoundingMission): resolves the already-committed roll, applies GDD §7b's
 * general failure package on a miss (Hardware recovery of what integration actually
 * spent, 80%/60% XP/Flight-Data, no Rep, next re-integration at half duration), resets
 * the pad for a future mission (Sprint 9 reuses this same pad).
 */
export function launchAuroraMission(
  resources: GameState['resources'],
  mission: MissionState,
  padId: PadId,
  completedTech: string[],
  narrativeSeen: string[],
  now: number,
): LaunchAuroraMissionResult | null {
  const pad = mission.pads[padId];
  if (!pad || pad.committedRoll === null) return null;

  const success = pad.committedRoll < pad.confidence / 100;
  const tier = currentHardwareTier(completedTech);
  let nextResources = resources;
  let nextNarrativeSeen = narrativeSeen;
  const halfDurationNext = { ...mission.auroraHalfDurationNext };

  if (success) {
    nextResources = {
      ...nextResources,
      flightxp: applyGrant(nextResources.flightxp, AURORA_I_REWARD.flightxp, true),
      reputation: applyGrant(nextResources.reputation, AURORA_I_REWARD.reputation, true),
      research: applyGrant(nextResources.research, AURORA_I_REWARD.flightData, true),
    };
    nextNarrativeSeen = markSeen(nextNarrativeSeen, 'N-11'); // First successful launch
    halfDurationNext[padId] = false;
  } else {
    const hardwareSpentOnIntegration = VAB_STAGE_IDS.reduce(
      (sum, id) => sum + (AURORA_I_STAGES_BY_ID.get(id)?.cost.hardware ?? 0),
      0,
    );
    nextResources = {
      ...nextResources,
      flightxp: applyGrant(nextResources.flightxp, AURORA_I_REWARD.flightxp * FAILURE_XP_RATE, true),
      research: applyGrant(nextResources.research, AURORA_I_REWARD.flightData * FAILURE_FLIGHT_DATA_RATE, true),
      hardware: creditHardware(
        nextResources.hardware,
        hardwareSpentOnIntegration * FAILURE_HARDWARE_RECOVERY_RATE,
        tier,
        true,
      ),
    };
    nextNarrativeSeen = markSeen(nextNarrativeSeen, 'N-12'); // Launch failure
    halfDurationNext[padId] = true;
  }

  return {
    resources: nextResources,
    mission: {
      ...mission,
      pads: {
        ...mission.pads,
        [padId]: { rocketStatus: 'none', stagesDone: [], checklist: { ...EMPTY_CHECKLIST }, confidence: 0, committedRoll: null },
      },
      auroraHalfDurationNext: halfDurationNext,
      launches: [
        ...mission.launches,
        { id: `aurora-launch-${padId}-${now}`, padId, missionType: 'auroraI', success, timestamp: now },
      ],
    },
    narrativeSeen: nextNarrativeSeen,
  };
}

export interface ResolveAuroraTickResult {
  resources: GameState['resources'];
  mission: MissionState;
  processes: Process[];
}

/**
 * The per-tick composition (called from state/persistStore.ts, same shape as
 * core/soundingMission.ts's own tick usage): applies whatever stage/weather processes
 * just completed, auto-queues the next VAB stage where eligible, then live-resolves
 * every pad's checklist (which may commit a roll). Iterates every pad that currently
 * exists (`mission.pads`) rather than hardcoding padA, so Launch Pad B (Sprint 9) needs
 * no change here.
 */
export function resolveAuroraTick(
  resources: GameState['resources'],
  mission: MissionState,
  buildings: GameState['buildings'],
  staff: StaffState,
  engineState: EngineCertificationState,
  flightXp: number,
  completedTech: string[],
  modifiers: Modifier[],
  processes: Process[],
  completedProcesses: Process[],
  now: number,
): ResolveAuroraTickResult {
  let nextMission = applyCompletedAuroraStages(mission, completedProcesses);
  nextMission = applyCompletedAuroraWeather(nextMission, completedProcesses);

  let nextResources = resources;
  let nextProcesses = processes;
  for (const padId of Object.keys(nextMission.pads) as PadId[]) {
    const autoQueued = maybeAutoQueueAuroraStage(nextResources, nextMission, padId, nextProcesses, engineState, completedTech, modifiers, now);
    nextResources = autoQueued.resources;
    nextMission = autoQueued.mission;
    nextProcesses = autoQueued.processes;
  }

  for (const padId of Object.keys(nextMission.pads) as PadId[]) {
    nextMission = resolveAuroraChecklist(nextMission, padId, buildings, staff, engineState, flightXp);
  }

  return { resources: nextResources, mission: nextMission, processes: nextProcesses };
}
