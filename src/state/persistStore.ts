import { create } from 'zustand';
import { createInitialState } from '../data/initialState';
import type { BuildingId, GameState, PadId, RoleId, SoundingRocketId } from '../core/types';
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations';
import {
  adjustStaffAssignment,
  applyCompletedProcesses,
  applyGatherMaterials,
  applyPitch,
  applyRushOrder,
  buyBuildingUpgrade,
  buyInternalUpgrade,
  hireStaff,
  releaseStaff,
  startCertification,
  startPromotion,
  startResearch,
} from '../core/actions';
import {
  launchAuroraMission,
  resolveAuroraTick,
  startAuroraWeatherCheck,
  startNextAuroraStage,
} from '../core/auroraMission';
import { resolveCertification } from '../core/certification';
import { acceptContract, maybeGenerateTierZeroOffer, resolveContractDeadlines } from '../core/contracts';
import { resolveEconomyTick } from '../core/economy';
import { applyModifiers, pruneExpiredModifiers } from '../core/modifiers';
import { OFFLINE_CAP_MS, resolveOffline, type PayrollStoppage } from '../core/offlineResolution';
import { contextFromState, resolveRecords } from '../core/records';
import { resolveResearch } from '../core/research';
import { totalHired, totalStaffCap } from '../core/staff';
import {
  applyCompletedSoundingProcesses,
  launchSoundingMission,
  paySoundingFlightReview,
  resolveSoundingChecklist,
  startSoundingAssembly,
  startSoundingWeatherCheck,
} from '../core/soundingMission';
import { resolveProcesses } from '../core/time';
import { markSeen } from '../data/narrative';
import { trackFirstOccurrence } from './telemetry';

const COMPLEX_B_UNLOCK_FUNDING = 300; // ECONOMY §4, matches ComplexTabs' own gate

export const SAVE_KEY = 'aurora-program-save';
const AUTOSAVE_INTERVAL_MS = 10_000;
const AWAY_SUMMARY_THRESHOLD_MS = 5 * 60_000; // UI_SPEC §3: modal only when >5 min elapsed

/** Reads localStorage and returns a valid GameState, migrating or falling back as needed. */
export function loadGame(): GameState {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return createInitialState();

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fromVersion = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0;
    const migrated =
      fromVersion === CURRENT_SCHEMA_VERSION ? parsed : migrate(parsed, fromVersion);
    const state = migrated as unknown as GameState;
    // Modifier.expiresAt contract (CLAUDE.md): pruned on load, not just filtered at
    // query time, so a save that sat around past an event's 2h expiry doesn't carry
    // dead entries forward indefinitely.
    return { ...state, modifiers: pruneExpiredModifiers(state.modifiers, Date.now()) };
  } catch {
    // Corrupt save: never crash the app on load (Sprint 8 adds a user-facing import
    // validation path for the Settings screen; this is the silent boot-time fallback).
    return createInitialState();
  }
}

// Sprint 3.5's dev-only reset button found a real race: removeItem() immediately
// followed by location.reload() isn't enough, because reload() fires `beforeunload`,
// and startAutosave()'s handler calls saveGame() with the CURRENT (pre-reset) in-memory
// state — silently re-writing the save right after it was cleared, before the reloaded
// page ever reads it (the same class of bug Sprint 2's away-modal test hit). Guarding
// saveGame itself with this flag is what makes the removal actually stick.
let resetInProgress = false;

/** Every save stamps the current time as `lastSeenAt` — however the session ends
 * (clean unload, tab kill, crash), the next load's offline-gap calc starts from the
 * last successful save, not a stale value from hours earlier. */
export function saveGame(state: GameState): void {
  if (resetInProgress) return;
  const now = Date.now();
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({ ...state, modifiers: pruneExpiredModifiers(state.modifiers, now), lastSeenAt: now }),
  );
}

/** Dev-only (CLAUDE.md rule 11, gated at the call site like TimeWarpControl): wipes the
 * save and reloads, for manual testing ahead of Sprint 8's real hard-reset UI. */
export function hardResetSave(): void {
  resetInProgress = true;
  localStorage.removeItem(SAVE_KEY);
  window.location.reload();
}

/**
 * Shared by computeBootOffline (offline gap) and applyTick (online frame): advances the
 * sounding mission's process-backed checklist items, advances every Aurora-I-class pad
 * (stage/weather completions, VAB-queue auto-progress, checklist+roll resolution),
 * rotates the tier-0 contract offer, penalizes any missed deadline, and grants any
 * newly-earned Program Record — the same composition either way, just fed a different
 * `now`/`completedProcesses` (rule 6: offline reuses the exact same resolution logic as
 * online). Threads `processes` through (not just returns it) because Aurora's VAB-queue
 * auto-start can add a new one, same as any other process-creating action.
 */
function resolveMissionsContractsAndRecords(
  mission: GameState['mission'],
  resources: GameState['resources'],
  processes: GameState['processes'],
  contracts: GameState['contracts'],
  records: string[],
  certifications: GameState['certifications'],
  buildings: GameState['buildings'],
  staff: GameState['staff'],
  completedTech: string[],
  completedProcesses: GameState['processes'],
  launchRailBuilt: boolean,
  now: number,
): {
  mission: GameState['mission'];
  resources: GameState['resources'];
  processes: GameState['processes'];
  contracts: GameState['contracts'];
  records: string[];
} {
  const missionAfterSoundingProcesses = applyCompletedSoundingProcesses(mission, completedProcesses);
  const missionAfterSounding = resolveSoundingChecklist(missionAfterSoundingProcesses, resources, certifications.engines.probe1);

  const auroraTick = resolveAuroraTick(
    resources,
    missionAfterSounding,
    buildings,
    staff,
    certifications.engines.orbital1,
    resources.flightxp.amount,
    completedTech,
    processes,
    completedProcesses,
    now,
  );

  const contractsWithOffer = maybeGenerateTierZeroOffer(contracts, launchRailBuilt, now);
  const deadlineResolution = resolveContractDeadlines(contractsWithOffer, auroraTick.resources, now);

  const recordsResolution = resolveRecords(
    records,
    deadlineResolution.resources,
    contextFromState({ certifications, mission: auroraTick.mission, contracts: deadlineResolution.contracts }),
  );

  return {
    mission: auroraTick.mission,
    resources: recordsResolution.resources,
    processes: auroraTick.processes,
    contracts: deadlineResolution.contracts,
    records: recordsResolution.records,
  };
}

export interface AwaySummary {
  elapsedMs: number;
  appliedMs: number;
  capped: boolean;
  fundingGained: number;
  researchGained: number;
  stoppage: PayrollStoppage | null;
}

interface AwaySummaryStore {
  summary: AwaySummary | null;
  dismiss: () => void;
}

// Resolved once, at module load (app boot), from whatever was on disk then. Kept
// OUTSIDE GameState/the main store deliberately: it's transient UI state for one modal,
// not save data — if it lived on the Store object alongside GameState fields,
// `saveGame(useGameStore.getState())` would serialize it into the save file.
function computeBootOffline(): { initialState: GameState; awaySummary: AwaySummary | null } {
  const loaded = loadGame();
  const now = Date.now();
  // ECONOMY §5 / SPRINTS Sprint 4 acceptance: Remote Ops raises the offline cap via a
  // registered modifier ('offline.capMs', +6h) — queried against modifiers as they stood
  // at close, not anything this same gap's research might complete (matches the online
  // tick's "a modifier only takes effect the moment it's registered" behavior).
  const offlineCapMs = applyModifiers(OFFLINE_CAP_MS, loaded.modifiers, 'offline.capMs', now);
  const offline = resolveOffline(
    loaded.resources,
    loaded.buildings,
    loaded.staff,
    loaded.research.completed,
    loaded.processes,
    loaded.lastSeenAt,
    now,
    offlineCapMs,
    loaded.economyFlags.payrollUnpaid,
  );

  // Research has its own dedicated slot (not the generic processes array) — resolved
  // separately, same resolveResearch call the online tick makes (rule 6). Promotions
  // (kind: 'training') DO live in the generic array, so the offline resolution above
  // already advanced them; applying their effect here is the same dispatcher the online
  // tick uses on its own completedProcesses.
  const researchResolution = resolveResearch(loaded.research, loaded.modifiers, now);
  const staffAfterCompletions = applyCompletedProcesses(loaded.staff, offline.completedProcesses);

  // Certifications have their own dedicated slot too (Sprint 5, same reasoning as
  // research above): resolved separately against the uncapped, real `now` — a
  // certification test's own timer runs at 100% offline (ECONOMY §11), same as research.
  const certificationResolution = resolveCertification(
    loaded.certifications,
    offline.resources,
    loaded.narrative.seen,
    loaded.research.completed,
    now,
  );

  // Missions (sounding + every Aurora-I-class pad)/contracts/records: same
  // tick-composition helper the online loop uses, fed the offline gap's completed
  // processes and the post-gap `now` (rule 6).
  const missionsResolution = resolveMissionsContractsAndRecords(
    loaded.mission,
    certificationResolution.resources,
    offline.processes,
    loaded.contracts,
    loaded.records,
    certificationResolution.certifications,
    offline.buildings,
    loaded.staff,
    loaded.research.completed,
    offline.completedProcesses,
    offline.buildings.launchRail.level >= 1,
    now,
  );

  const initialState: GameState = {
    ...loaded,
    resources: missionsResolution.resources,
    buildings: offline.buildings,
    processes: missionsResolution.processes,
    staff: staffAfterCompletions,
    research: researchResolution.research,
    certifications: certificationResolution.certifications,
    mission: missionsResolution.mission,
    contracts: missionsResolution.contracts,
    records: missionsResolution.records,
    narrative: { ...loaded.narrative, seen: certificationResolution.narrativeSeen },
    // Modifier.expiresAt contract: pruned again here (not just at load) against the
    // POST-GAP `now` — a modifier that expired partway through an offline gap must not
    // survive into the fresh boot state just because it was still alive at load time.
    modifiers: pruneExpiredModifiers(researchResolution.modifiers, now),
    economyFlags: { ...loaded.economyFlags, payrollUnpaid: offline.payrollUnpaid },
    lastSeenAt: now,
  };

  const awaySummary: AwaySummary | null =
    offline.elapsedMs > AWAY_SUMMARY_THRESHOLD_MS
      ? {
          elapsedMs: offline.elapsedMs,
          appliedMs: offline.appliedMs,
          capped: offline.capped,
          // Uses missionsResolution.resources, not offline.resources, for both: a
          // certification resolving during the gap credits Flight Data into Research
          // (ECONOMY §8), and a newly-earned Program Record can credit Funding during the
          // gap too (e.g. "First ignition" backfilling the instant that certification
          // resolves) — omitting either would silently under-report the summary.
          fundingGained: missionsResolution.resources.funding.amount - loaded.resources.funding.amount,
          researchGained: missionsResolution.resources.research.amount - loaded.resources.research.amount,
          stoppage: offline.stoppage,
        }
      : null;

  return { initialState, awaySummary };
}

const boot = computeBootOffline();

export const useAwaySummary = create<AwaySummaryStore>()((set) => ({
  summary: boot.awaySummary,
  dismiss: () => set({ summary: null }),
}));

export interface GameActions {
  /** ECONOMY §2 manual pitch — always succeeds, ignores the Funding cap. */
  pitch: () => void;
  /** No-ops (via core/actions.ts) if unaffordable or already built (one-time buildings). */
  buyBuilding: (buildingId: BuildingId) => void;
  /** No-ops if already owned, no such upgrade on this building, or unaffordable. */
  buyInternalUpgrade: (buildingId: BuildingId, upgradeId: string) => void;
  /** ECONOMY §2 manual gather — free, one-time Materials grant. No-ops before Supply Depot lv1. */
  gatherMaterials: () => void;
  /** ECONOMY §2 Rush Order — instant Materials for Funding. No-ops before Fabrication is built or if unaffordable. */
  rushOrder: () => void;
  /** No-ops if the role isn't tech-unlocked, is unaffordable, or the staff cap is full. */
  hire: (role: RoleId) => void;
  /** delta is typically +1/-1 from a UI stepper; no-ops if it would violate slots/hired. */
  assign: (role: RoleId, buildingId: BuildingId, delta: number) => void;
  /** UI_SPEC §4b: releases one hired unit of `role`. No refund, no cooldown. No-op if none hired. */
  release: (role: RoleId) => void;
  /** No-ops if the node isn't available, something else is already researching, or Research is short. */
  startResearchNode: (nodeId: string) => void;
  /** No-ops if the Classroom isn't built, no unassigned unit of `from`, or Funding is short. */
  startPromotion: (from: RoleId, to: RoleId) => void;
  /** No-ops if the test isn't available for its engine, something else is already
   * testing, or Hardware/Propellant are short. */
  startCertificationTest: (testId: string) => void;
  /** No-ops if a mission is already in flight, the rocket isn't unlocked, the required
   * buildings aren't built, or Hardware is short. `contractId` links this build to an
   * accepted tier-0 contract (S-1 only, ECONOMY §10). */
  startSoundingMission: (rocketId: SoundingRocketId, contractId?: string | null) => void;
  /** No-ops if there's no mission in flight, the item is already done, or a weather
   * check is already running. */
  startWeatherCheck: () => void;
  /** No-ops outside an S-2 mission, if already paid, or Research is short. */
  payFlightReview: () => void;
  /** No-ops until the checklist has committed a roll (rule 12). Resolves the
   * already-decided outcome and resets the mission slot either way. */
  launchSounding: () => void;
  /** No-ops if the offer doesn't exist, has expired, or is already accepted. */
  acceptContractOffer: (offerId: string) => void;
  /** Starts (or, for the instant Flight Review, resolves) the next of Aurora I's 8
   * sequential stages on `padId`. No-ops if a stage is already running on this pad, the
   * next stage is "Engines" and Orbital-1 isn't certified yet, or the cost is short. */
  startAuroraStage: (padId: PadId) => void;
  /** No-ops if the pad's weather item is already done or a check is already running. */
  startAuroraWeather: (padId: PadId) => void;
  /** No-ops until the pad's checklist has committed a roll (rule 12). Resolves the
   * already-decided outcome and resets the pad either way. */
  launchAurora: (padId: PadId) => void;
  /** Called once per animation frame by the game loop (see core/tick.ts + main.tsx).
   * `warp` (dev builds only, default 1) is the real caller passing a possibly-warped
   * multiplier — see `applyTick`'s implementation for why processes need it separately
   * from `deltaMs`. */
  applyTick: (deltaMs: number, warp?: number) => void;
}

export type Store = GameState & GameActions;

export const useGameStore = create<Store>()((set, get) => ({
  ...boot.initialState,

  pitch: () => {
    set((state) => ({
      resources: applyPitch(state.resources, state.buildings.offices.level),
      telemetry: trackFirstOccurrence(state.telemetry, 'first_pitch'),
      narrative: { ...state.narrative, seen: markSeen(state.narrative.seen, 'N-01') }, // First manual pitch
    }));
  },

  buyBuilding: (buildingId) => {
    const state = get();
    const result = buyBuildingUpgrade(state.resources, state.buildings, buildingId);
    if (result) {
      let seen = state.narrative.seen;
      if (buildingId === 'finance' && result.buildings.finance.level === 1) seen = markSeen(seen, 'N-03');
      if (buildingId === 'testStand' && result.buildings.testStand.level === 1) seen = markSeen(seen, 'N-06');
      set({
        ...result,
        telemetry: trackFirstOccurrence(state.telemetry, 'first_building_upgrade', { buildingId }),
        narrative: { ...state.narrative, seen },
      });
    }
  },

  buyInternalUpgrade: (buildingId, upgradeId) => {
    const state = get();
    const result = buyInternalUpgrade(state.resources, state.buildings, buildingId, upgradeId);
    if (result) set(result);
  },

  gatherMaterials: () => {
    const state = get();
    const resources = applyGatherMaterials(state.resources, state.buildings.supplyDepot.level);
    if (resources) set({ resources });
  },

  rushOrder: () => {
    const state = get();
    const resources = applyRushOrder(state.resources, state.buildings.fabrication.level);
    if (resources) set({ resources });
  },

  hire: (role) => {
    const state = get();
    const result = hireStaff(
      state.resources,
      state.staff,
      state.research.completed,
      state.buildings.crewQuarters.level,
      role,
    );
    if (result) {
      // UI_SPEC §2d Campus reveal step 4: "the staff pool reaches its cap for the first
      // time" — a one-way trigger (rule: once revealed, Crew Quarters/R&D Lab stay
      // revealed even if a later Release, §4b, drops the pool back under cap), so it's
      // latched here rather than derived live from the current hired/cap comparison.
      const staffCapReachedOnce =
        state.staffCapReachedOnce ||
        totalHired(result.staff) >= totalStaffCap(state.buildings.crewQuarters.level);
      set({
        ...result,
        staffCapReachedOnce,
        telemetry: trackFirstOccurrence(state.telemetry, 'first_hire', { role }),
        narrative: { ...state.narrative, seen: markSeen(state.narrative.seen, 'N-02') }, // First hire
      });
    }
  },

  assign: (role, buildingId, delta) => {
    const state = get();
    const staff = adjustStaffAssignment(state.staff, role, buildingId, delta, state.buildings[buildingId].level);
    if (staff) set({ staff });
  },

  release: (role) => {
    const state = get();
    const staff = releaseStaff(state.staff, role);
    if (staff) set({ staff });
  },

  startResearchNode: (nodeId) => {
    const state = get();
    const result = startResearch(state.resources, state.research, nodeId, Date.now());
    if (result) {
      set({ ...result, telemetry: trackFirstOccurrence(state.telemetry, 'first_research_started', { nodeId }) });
    }
  },

  startPromotion: (from, to) => {
    const state = get();
    const classroomBuilt = state.buildings.crewQuarters.upgrades.includes('classroom');
    const result = startPromotion(state.resources, state.staff, state.processes, classroomBuilt, from, to, Date.now());
    if (result) set(result);
  },

  startCertificationTest: (testId) => {
    const state = get();
    const result = startCertification(
      state.resources,
      state.certifications,
      testId,
      state.buildings.testStand.level,
      state.buildings.testStand.upgrades.includes('instrumentation'),
      Date.now(),
    );
    if (result) {
      set({ ...result, telemetry: trackFirstOccurrence(state.telemetry, 'first_certification_started', { testId }) });
    }
  },

  startSoundingMission: (rocketId, contractId = null) => {
    const state = get();
    const result = startSoundingAssembly(
      state.resources,
      state.mission,
      state.research.completed,
      state.buildings.testStand.level >= 1,
      state.buildings.launchRail.level >= 1,
      state.buildings.launchRail.upgrades.includes('extendedRail'),
      state.certifications.engines.probe1,
      state.processes,
      rocketId,
      contractId,
      Date.now(),
    );
    if (result) {
      set({
        ...result,
        telemetry: trackFirstOccurrence(state.telemetry, 'first_sounding_mission_started', { rocketId }),
      });
    }
  },

  startWeatherCheck: () => {
    const state = get();
    const result = startSoundingWeatherCheck(state.mission, state.processes, Date.now());
    if (result) set(result);
  },

  payFlightReview: () => {
    const state = get();
    const result = paySoundingFlightReview(state.resources, state.mission);
    if (result) set(result);
  },

  launchSounding: () => {
    const state = get();
    const result = launchSoundingMission(
      state.resources,
      state.mission,
      state.contracts,
      state.narrative.seen,
      state.research.completed,
      Date.now(),
    );
    if (result) {
      set({
        resources: result.resources,
        mission: result.mission,
        contracts: result.contracts,
        narrative: { ...state.narrative, seen: result.narrativeSeen },
        telemetry: trackFirstOccurrence(state.telemetry, 'first_sounding_launch'),
      });
    }
  },

  acceptContractOffer: (offerId) => {
    const state = get();
    const contracts = acceptContract(state.contracts, offerId, Date.now());
    if (contracts) {
      set({ contracts, telemetry: trackFirstOccurrence(state.telemetry, 'first_contract_accepted') });
    }
  },

  startAuroraStage: (padId) => {
    const state = get();
    const result = startNextAuroraStage(
      state.resources,
      state.mission,
      padId,
      state.processes,
      state.certifications.engines.orbital1,
      state.research.completed,
      Date.now(),
    );
    if (result) {
      set({ ...result, telemetry: trackFirstOccurrence(state.telemetry, 'first_aurora_stage_started', { padId }) });
    }
  },

  startAuroraWeather: (padId) => {
    const state = get();
    const result = startAuroraWeatherCheck(state.mission, padId, state.processes, Date.now());
    if (result) set(result);
  },

  launchAurora: (padId) => {
    const state = get();
    // N-10 (Countdown, mission 1): fires the moment the player presses the dominant
    // countdown button, before the already-committed outcome (rule 12) is revealed —
    // matches the live 10->0 countdown beat's place in the sequence (GDD §7).
    const seenBeforeResolution = markSeen(state.narrative.seen, 'N-10');
    const result = launchAuroraMission(
      state.resources,
      state.mission,
      padId,
      state.research.completed,
      seenBeforeResolution,
      Date.now(),
    );
    if (result) {
      set({
        resources: result.resources,
        mission: result.mission,
        narrative: { ...state.narrative, seen: result.narrativeSeen },
        telemetry: trackFirstOccurrence(state.telemetry, 'first_aurora_launch', { padId }),
      });
    }
  },

  applyTick: (deltaMs, warp = 1) => {
    const state = get();
    const { resources, buildings, payrollUnpaid } = resolveEconomyTick(
      state.resources,
      state.buildings,
      state.staff,
      state.research.completed,
      deltaMs * warp,
    );

    // Time-warp applies "at the timestamp layer" (SPRINTS.md Sprint 2 task 3), not by
    // giving processes their own scaled-rate concept: each frame, warp creates
    // `deltaMs * (warp - 1)` of extra virtual time, which we spend by pulling every
    // in-flight process's `startedAt` back by that amount. The completion check itself
    // (`resolveProcesses`) then runs against the real clock — the exact same call and
    // the exact same comparison offline resolution uses (rule 6) — so nothing downstream
    // needs to know warp was involved, and once warp returns to x1 no more shifting
    // happens (no drifting virtual clock to persist or migrate).
    const warpBonusMs = deltaMs * (warp - 1);
    const shiftedProcesses =
      warpBonusMs > 0
        ? state.processes.map((p) => ({ ...p, startedAt: p.startedAt - warpBonusMs }))
        : state.processes;
    const { completed: completedProcesses, remaining: processes } = resolveProcesses(
      shiftedProcesses,
      Date.now(),
    );
    const staffAfterCompletions = applyCompletedProcesses(state.staff, completedProcesses);

    // Research has its own dedicated slot, not the generic processes array, but is
    // otherwise timestamp-based the same way — the same warp-shift, the same
    // resolveResearch call offline resolution makes.
    const shiftedResearch =
      warpBonusMs > 0 && state.research.inProgress
        ? {
            ...state.research,
            inProgress: { ...state.research.inProgress, startedAt: state.research.inProgress.startedAt - warpBonusMs },
          }
        : state.research;
    const researchResolution = resolveResearch(shiftedResearch, state.modifiers, Date.now());

    // Certifications: same warp-shift, same dedicated-slot pattern as research above.
    const shiftedCertifications =
      warpBonusMs > 0 && state.certifications.inProgress
        ? {
            ...state.certifications,
            inProgress: {
              ...state.certifications.inProgress,
              startedAt: state.certifications.inProgress.startedAt - warpBonusMs,
            },
          }
        : state.certifications;
    const certificationResolution = resolveCertification(
      shiftedCertifications,
      resources,
      state.narrative.seen,
      state.research.completed,
      Date.now(),
    );

    // Passive/threshold beats (no discrete player action to hook): checked every tick
    // against the freshly-resolved resources, same as ComplexTabs' own live unlock gate.
    let seen = certificationResolution.narrativeSeen;
    if (certificationResolution.resources.funding.lifetimeEarned >= COMPLEX_B_UNLOCK_FUNDING) {
      seen = markSeen(seen, 'N-04'); // Complex B unlocked
    }
    if (certificationResolution.resources.hardware.lifetimeEarned > 0) {
      seen = markSeen(seen, 'N-05'); // First Hardware fabricated
    }

    // Missions (sounding + every Aurora-I-class pad)/contracts/records: same
    // composition computeBootOffline uses, fed this frame's completedProcesses
    // (assembly/weather-window entries in the generic array above, already
    // warp-shifted alongside everything else in it) and the real clock.
    const missionsResolution = resolveMissionsContractsAndRecords(
      state.mission,
      certificationResolution.resources,
      processes,
      state.contracts,
      state.records,
      certificationResolution.certifications,
      buildings,
      state.staff,
      state.research.completed,
      completedProcesses,
      buildings.launchRail.level >= 1,
      Date.now(),
    );

    // N-09/N-15: passive/threshold beats, same pattern as N-04/N-05 above — no discrete
    // action to hook (a pad's checklist item flips via tick resolution, not a click; a
    // research node can complete mid-tick same as any other).
    if (Object.values(missionsResolution.mission.pads).some((pad) => pad?.checklist.rocketIntegrated)) {
      seen = markSeen(seen, 'N-09'); // Aurora I integrated
    }
    if (researchResolution.justCompleted === 'orbitalFlight') {
      seen = markSeen(seen, 'N-15'); // Orbital flight tech
    }

    set({
      resources: missionsResolution.resources,
      buildings,
      processes: missionsResolution.processes,
      staff: staffAfterCompletions,
      research: researchResolution.research,
      mission: missionsResolution.mission,
      contracts: missionsResolution.contracts,
      records: missionsResolution.records,
      certifications: certificationResolution.certifications,
      narrative: { ...state.narrative, seen },
      modifiers: researchResolution.modifiers,
      economyFlags: { ...state.economyFlags, payrollUnpaid },
    });
  },
}));

/**
 * Persists to localStorage every 10s and on tab close/hide (rule: state updates the
 * store continuously, but we don't want to write to localStorage on every mutation).
 * Returns a cleanup function that stops the interval and removes the listeners.
 */
export function startAutosave(): () => void {
  const flush = () => saveGame(useGameStore.getState());

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  const interval = setInterval(flush, AUTOSAVE_INTERVAL_MS);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    clearInterval(interval);
    window.removeEventListener('beforeunload', flush);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
