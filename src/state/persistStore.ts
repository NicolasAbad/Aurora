import { create } from 'zustand';
import { createInitialState } from '../data/initialState';
import type { BuildingId, GameState, PadId, RoleId, SoundingRocketId } from '../core/types';
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations';
import { BUILDINGS } from '../data/buildings';
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
  emptyPadMissionState,
  launchAuroraMission,
  resolveAuroraTick,
  startAuroraWeatherCheck,
  startNextAuroraStage,
} from '../core/auroraMission';
import { resolveCertification } from '../core/certification';
import {
  acceptContract,
  maybeGenerateSatelliteOffer,
  maybeGenerateTierZeroOffer,
  resolveContractDeadlines,
} from '../core/contracts';
import {
  launchContractMission,
  resolveContractMissionTick,
  startContractWeatherCheck,
  startNextContractStage,
} from '../core/contractMission';
import { resolveEconomyTick } from '../core/economy';
import { DEFAULT_EVENTS_STATE, resolveEventChoice, tickEvents } from '../core/events';
import { applyModifiers, pruneExpiredModifiers } from '../core/modifiers';
import { OFFLINE_CAP_MS, resolveOffline, type PayrollStoppage } from '../core/offlineResolution';
import { contextFromState, RECORD_DEFS, resolveRecords } from '../core/records';
import {
  describeCompletedCertification,
  describeCompletedProcess,
  describeCompletedResearch,
} from '../core/processLabel';
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
import { RESEARCH_BY_ID } from '../data/researchTree';
import { ROLE_LABEL } from '../data/roles';
import { appendLogLine, markSeen, missionLogBase, narrativeText, syncSeenIntoLog } from '../data/narrative';
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

export interface ImportSaveResult {
  ok: boolean;
  error?: string;
}

/**
 * UI_SPEC §6: Settings screen save import (string or file — the caller reads a file
 * into a string before calling this either way). "Export string is versioned and
 * validated on import with a clear error for corrupt/newer-version saves." Unlike
 * `loadGame()`'s silent boot-time fallback (a corrupt AUTO-load must never crash the
 * app), an explicit import failure needs to say so — a player pasting the wrong thing
 * should get an error, not a silently-reset game.
 *
 * `migrate()` only walks FORWARD from an older schemaVersion; it has no guard against
 * fromVersion being newer than CURRENT_SCHEMA_VERSION (a save from a future build) — its
 * loop condition simply never runs, silently passing the newer state through unchanged.
 * That's fine for `migrate()`'s own contract (nothing calls it with a newer version
 * today), but import is exactly the path where an incompatible newer save could arrive,
 * so it's checked explicitly here.
 *
 * On success, reloads the page so the normal boot path (computeBootOffline/loadGame)
 * picks up the freshly written save — same `resetInProgress` guard hardResetSave uses,
 * so the autosave's beforeunload handler can't clobber the import with stale in-memory
 * state during the reload (Sprint 3.5's race, same class, same fix).
 *
 * `reload` is injectable (defaults to the real `window.location.reload`) purely for
 * testability: jsdom's `location.reload` is non-configurable, so it can't be
 * `vi.spyOn`-ed, and actually invoking it mid-test-suite was found to corrupt jsdom's
 * shared localStorage/navigation state for every test that ran afterward in the same
 * file — a real footgun discovered while writing this function's own tests, not a
 * hypothetical one.
 */
export function importSave(raw: string, reload: () => void = () => window.location.reload()): ImportSaveResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "That doesn't look like a valid Aurora Program save (not valid JSON)." };
  }
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.schemaVersion !== 'number') {
    return { ok: false, error: "That doesn't look like a valid Aurora Program save (missing version info)." };
  }

  const fromVersion = parsed.schemaVersion;
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: 'This save is from a newer version of Aurora Program than this build supports.',
    };
  }

  try {
    const migrated = fromVersion === CURRENT_SCHEMA_VERSION ? parsed : migrate(parsed, fromVersion);
    // Import restores everything verbatim, including any committed launch roll — saves
    // are deterministic snapshots (UI_SPEC §6's own note), so no special-casing needed.
    resetInProgress = true;
    localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
    reload();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not load this save — it may be corrupted.' };
  }
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
  modifiers: GameState['modifiers'],
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
    modifiers,
    processes,
    completedProcesses,
    now,
  );

  // Sprint 9: satellite-contract pads (core/contractMission.ts) resolve independently of
  // Aurora's own pads — auroraTick.mission already carries any padB Aurora just touched;
  // this pass only ever advances pads with PadMissionState.contractId set (its own guard).
  const contractTick = resolveContractMissionTick(
    auroraTick.mission,
    buildings,
    staff,
    certifications.engines.orbital1,
    resources.flightxp.amount,
    completedProcesses,
  );

  let contractsWithOffers = maybeGenerateTierZeroOffer(contracts, launchRailBuilt, now);
  const payloadProcessingBuilt = buildings.payloadProcessing.level >= 1;
  contractsWithOffers = maybeGenerateSatelliteOffer(1, contractsWithOffers, payloadProcessingBuilt, now);
  contractsWithOffers = maybeGenerateSatelliteOffer(2, contractsWithOffers, payloadProcessingBuilt, now);
  const deadlineResolution = resolveContractDeadlines(contractsWithOffers, auroraTick.resources, now);

  const recordsResolution = resolveRecords(
    records,
    deadlineResolution.resources,
    contextFromState({ certifications, mission: contractTick.mission, contracts: deadlineResolution.contracts }),
  );

  return {
    mission: contractTick.mission,
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
  // SPRINTS.md Sprint 8, task 3 (away-modal polish): the other four resources reachable
  // by Sprint 8 (Materials/Hardware/Propellant weren't offline-relevant back when this
  // was Funding/Research-only, per Sprint 2's own scope note; Reputation/Flight XP
  // weren't either, before certifications/missions existed).
  materialsGained: number;
  hardwareGained: number;
  propellantGained: number;
  reputationGained: number;
  flightxpGained: number;
  // What finished during the gap, in completion order — research/certification (their
  // own dedicated GameState slots) plus every kind in the generic processes array
  // (promotions, sonda/Aurora integration + weather windows, pad transfers, contract
  // builds). Empty when nothing completed — the modal simply omits this section.
  completedProcessLabels: string[];
  // Program Records newly earned during the gap (name, not id — same as
  // MilestoneCallout's title, since a record earned while away never got its own
  // on-screen call-out at the time).
  newRecordNames: string[];
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
    loaded.modifiers,
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
    loaded.modifiers,
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
    // Sprint 9.5: offline-earned beats also feed the Mission Log's `log` feed (see
    // data/narrative.ts's header note) — generic completions (T-18/19/20) are
    // deliberately NOT backfilled for an offline gap, since the away-modal already
    // reports those; this only keeps narrative BEATS in sync with the unified feed.
    narrative: {
      seen: certificationResolution.narrativeSeen,
      log: syncSeenIntoLog(
        loaded.narrative.seen.length,
        certificationResolution.narrativeSeen,
        missionLogBase(loaded.narrative),
      ),
    },
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
          // Uses missionsResolution.resources, not offline.resources, throughout: a
          // certification resolving during the gap credits Flight Data into Research
          // (ECONOMY §8), and a newly-earned Program Record can credit Funding during the
          // gap too (e.g. "First ignition" backfilling the instant that certification
          // resolves) — omitting either would silently under-report the summary.
          fundingGained: missionsResolution.resources.funding.amount - loaded.resources.funding.amount,
          researchGained: missionsResolution.resources.research.amount - loaded.resources.research.amount,
          materialsGained: missionsResolution.resources.materials.amount - loaded.resources.materials.amount,
          hardwareGained: missionsResolution.resources.hardware.amount - loaded.resources.hardware.amount,
          propellantGained: missionsResolution.resources.propellant.amount - loaded.resources.propellant.amount,
          reputationGained: missionsResolution.resources.reputation.amount - loaded.resources.reputation.amount,
          flightxpGained: missionsResolution.resources.flightxp.amount - loaded.resources.flightxp.amount,
          completedProcessLabels: [
            ...researchResolution.justCompletedIds.map(describeCompletedResearch),
            ...(certificationResolution.justCompleted
              ? [describeCompletedCertification(certificationResolution.justCompleted.testId)]
              : []),
            ...offline.completedProcesses.map(describeCompletedProcess),
          ],
          newRecordNames: missionsResolution.records
            .filter((id) => !loaded.records.includes(id))
            .map((id) => RECORD_DEFS[id as keyof typeof RECORD_DEFS]?.name ?? id),
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
  /** ECONOMY §10 v3.6: starts (or continues) `offerId`'s satellite payload build on
   * `padId`. No-ops if the pad is occupied by anything else, the contract isn't a
   * currently-accepted tier-1/2 offer, its Reputation/Clean Room prerequisite is unmet
   * (checked only when starting fresh), or the stage's cost is short. */
  startContractStage: (padId: PadId, offerId: string) => void;
  /** No-ops if the pad has no contract-linked mission, its weather item is already done,
   * or a check is already running. */
  startContractWeather: (padId: PadId) => void;
  /** No-ops until the pad's contract-linked checklist has committed a roll (rule 12).
   * Resolves the already-decided outcome; the contract stays active on failure. */
  launchContract: (padId: PadId) => void;
  /** NARRATIVE §3: applies the chosen option's effect to whichever event is currently
   * pending, then clears it. No-ops if nothing is pending. */
  resolveEvent: (choice: 'A' | 'B') => void;
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
    set((state) => {
      const seen = markSeen(state.narrative.seen, 'N-01'); // First manual pitch
      return {
        resources: applyPitch(state.resources, state.buildings.offices.level),
        telemetry: trackFirstOccurrence(state.telemetry, 'first_pitch'),
        narrative: { seen, log: syncSeenIntoLog(state.narrative.seen.length, seen, missionLogBase(state.narrative)) },
      };
    });
  },

  buyBuilding: (buildingId) => {
    const state = get();
    const result = buyBuildingUpgrade(state.resources, state.buildings, buildingId);
    if (result) {
      let seen = state.narrative.seen;
      let mission = state.mission;
      if (buildingId === 'finance' && result.buildings.finance.level === 1) seen = markSeen(seen, 'N-03');
      if (buildingId === 'testStand' && result.buildings.testStand.level === 1) seen = markSeen(seen, 'N-06');
      if (buildingId === 'launchPadB' && result.buildings.launchPadB.level === 1) {
        seen = markSeen(seen, 'N-17'); // Launch Pad B built
        mission = { ...mission, pads: { ...mission.pads, padB: emptyPadMissionState() } };
      }
      set({
        ...result,
        mission,
        telemetry: trackFirstOccurrence(state.telemetry, 'first_building_upgrade', { buildingId }),
        narrative: { seen, log: syncSeenIntoLog(state.narrative.seen.length, seen, missionLogBase(state.narrative)) },
      });
    }
  },

  buyInternalUpgrade: (buildingId, upgradeId) => {
    const state = get();
    const result = buyInternalUpgrade(state.resources, state.buildings, buildingId, upgradeId);
    if (result) {
      // T-20 (NARRATIVE §9 v3.7): "previously silent" — an internal-upgrade purchase
      // (has a real, discrete name, unlike a routine building level-up) now logs a line.
      const upgradeDef = BUILDINGS[buildingId].internalUpgrades?.find((u) => u.id === upgradeId);
      const log = appendLogLine(
        missionLogBase(state.narrative),
        narrativeText('T-20', { building: BUILDINGS[buildingId].name, upgrade: upgradeDef?.name ?? upgradeId }),
      );
      set({ ...result, narrative: { ...state.narrative, log } });
    }
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
      const seen = markSeen(state.narrative.seen, 'N-02'); // First hire
      set({
        ...result,
        staffCapReachedOnce,
        telemetry: trackFirstOccurrence(state.telemetry, 'first_hire', { role }),
        narrative: { seen, log: syncSeenIntoLog(state.narrative.seen.length, seen, missionLogBase(state.narrative)) },
      });
    }
  },

  assign: (role, buildingId, delta) => {
    const state = get();
    const staff = adjustStaffAssignment(
      state.staff,
      role,
      buildingId,
      delta,
      state.buildings[buildingId].level,
      state.buildings[buildingId].upgrades,
    );
    if (staff) set({ staff });
  },

  release: (role) => {
    const state = get();
    const staff = releaseStaff(state.staff, role);
    if (staff) set({ staff });
  },

  startResearchNode: (nodeId) => {
    const state = get();
    const secondTrackUnlocked = state.buildings.rndLab.upgrades.includes('secondResearchTrack');
    const result = startResearch(state.resources, state.research, nodeId, Date.now(), secondTrackUnlocked);
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
        narrative: {
          seen: result.narrativeSeen,
          log: syncSeenIntoLog(state.narrative.seen.length, result.narrativeSeen, missionLogBase(state.narrative)),
        },
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

  startContractStage: (padId, offerId) => {
    const state = get();
    const result = startNextContractStage(
      state.resources,
      state.mission,
      state.contracts,
      padId,
      offerId,
      state.processes,
      state.buildings,
      state.research.completed,
      state.modifiers,
      Date.now(),
    );
    if (result) {
      set({
        resources: result.resources,
        mission: result.mission,
        processes: result.processes,
        contracts: result.contracts,
        telemetry: trackFirstOccurrence(state.telemetry, 'first_contract_stage_started', { padId, offerId }),
      });
    }
  },

  startContractWeather: (padId) => {
    const state = get();
    const result = startContractWeatherCheck(state.mission, padId, state.processes, Date.now());
    if (result) set(result);
  },

  launchContract: (padId) => {
    const state = get();
    const result = launchContractMission(
      state.resources,
      state.mission,
      state.contracts,
      padId,
      state.narrative.seen,
      state.research.completed,
      Date.now(),
    );
    if (result) {
      set({
        resources: result.resources,
        mission: result.mission,
        contracts: result.contracts,
        narrative: {
          seen: result.narrativeSeen,
          log: syncSeenIntoLog(state.narrative.seen.length, result.narrativeSeen, missionLogBase(state.narrative)),
        },
        telemetry: trackFirstOccurrence(state.telemetry, 'first_contract_launch', { padId }),
      });
    }
  },

  resolveEvent: (choice) => {
    const state = get();
    const result = resolveEventChoice(state, choice, Date.now());
    if (result) set(result);
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
      state.modifiers,
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
        narrative: {
          seen: result.narrativeSeen,
          log: syncSeenIntoLog(state.narrative.seen.length, result.narrativeSeen, missionLogBase(state.narrative)),
        },
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
      1,
      state.modifiers,
      Date.now(),
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

    // Research has its own dedicated slot(s), not the generic processes array, but is
    // otherwise timestamp-based the same way — the same warp-shift, the same
    // resolveResearch call offline resolution makes. Second track (ECONOMY §4 v3.6)
    // shifts independently — either, neither, or both slots may be occupied.
    const shiftedResearch =
      warpBonusMs > 0
        ? {
            ...state.research,
            inProgress: state.research.inProgress
              ? { ...state.research.inProgress, startedAt: state.research.inProgress.startedAt - warpBonusMs }
              : state.research.inProgress,
            secondInProgress: state.research.secondInProgress
              ? { ...state.research.secondInProgress, startedAt: state.research.secondInProgress.startedAt - warpBonusMs }
              : state.research.secondInProgress,
          }
        : state.research;
    const researchResolution = resolveResearch(shiftedResearch, state.modifiers, Date.now());

    // T-18/T-19 (NARRATIVE §9 v3.7): promotions and research completions previously
    // produced no Mission Log entry at all during live play (only the away-modal's
    // offline summary described them, and only for a gap the player already missed).
    let log = missionLogBase(state.narrative);
    for (const process of completedProcesses) {
      if (process.kind !== 'training') continue;
      const { from, to } = process.payload as { from: RoleId; to: RoleId };
      log = appendLogLine(log, narrativeText('T-18', { fromRole: ROLE_LABEL[from], toRole: ROLE_LABEL[to] }));
    }
    for (const nodeId of researchResolution.justCompletedIds) {
      const node = RESEARCH_BY_ID.get(nodeId);
      log = appendLogLine(log, narrativeText('T-19', { node: node?.name ?? nodeId }));
    }

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
      state.modifiers,
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
    if (researchResolution.justCompletedIds.includes('orbitalFlight')) {
      seen = markSeen(seen, 'N-15'); // Orbital flight tech
    }

    // NARRATIVE §3 (Sprint 9): random events. Online-only — accumulates real "active"
    // time (warp-scaled, same as everything else this tick), never runs during offline
    // resolution (core/types.ts's EventsState comment explains why). "Never during
    // countdown": any pad or the sounding mission currently sitting on a committed roll,
    // awaiting the launch button.
    const duringCountdown =
      Object.values(missionsResolution.mission.pads).some((pad) => pad?.committedRoll !== null) ||
      missionsResolution.mission.sounding?.committedRoll != null;
    const eventsTick = tickEvents(
      state.events ?? DEFAULT_EVENTS_STATE,
      deltaMs * warp,
      {
        refineryBuilt: buildings.refinery.level >= 1,
        complexBBuilt: missionsResolution.resources.funding.lifetimeEarned >= COMPLEX_B_UNLOCK_FUNDING,
        hardwareAmount: missionsResolution.resources.hardware.amount,
        scientistsHired: state.staff.pools.scientist.hired,
      },
      duringCountdown,
      Date.now(),
    );

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
      narrative: { seen, log: syncSeenIntoLog(state.narrative.seen.length, seen, log) },
      modifiers: researchResolution.modifiers,
      economyFlags: { ...state.economyFlags, payrollUnpaid },
      events: eventsTick.events,
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
