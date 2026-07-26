import { create } from 'zustand';
import { createInitialState } from '../data/initialState';
import type { BuildingId, GameState, RoleId } from '../core/types';
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
  startCertification,
  startPromotion,
  startResearch,
} from '../core/actions';
import { resolveCertification } from '../core/certification';
import { resolveEconomyTick } from '../core/economy';
import { applyModifiers, pruneExpiredModifiers } from '../core/modifiers';
import { OFFLINE_CAP_MS, resolveOffline, type PayrollStoppage } from '../core/offlineResolution';
import { resolveResearch } from '../core/research';
import { resolveProcesses } from '../core/time';
import { trackFirstOccurrence } from './telemetry';

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

  const initialState: GameState = {
    ...loaded,
    resources: certificationResolution.resources,
    buildings: offline.buildings,
    processes: offline.processes,
    staff: staffAfterCompletions,
    research: researchResolution.research,
    certifications: certificationResolution.certifications,
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
          fundingGained: offline.resources.funding.amount - loaded.resources.funding.amount,
          // Uses certificationResolution.resources, not offline.resources: a
          // certification test resolving during the gap credits Flight Data into
          // Research too (ECONOMY §8), same as it would from a live tick — omitting it
          // here would silently under-report the summary for that gap.
          researchGained: certificationResolution.resources.research.amount - loaded.resources.research.amount,
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
  /** No-ops if the node isn't available, something else is already researching, or Research is short. */
  startResearchNode: (nodeId: string) => void;
  /** No-ops if the Classroom isn't built, no unassigned unit of `from`, or Funding is short. */
  startPromotion: (from: RoleId, to: RoleId) => void;
  /** No-ops if the test isn't available for its engine, something else is already
   * testing, or Hardware/Propellant are short. */
  startCertificationTest: (testId: string) => void;
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
    }));
  },

  buyBuilding: (buildingId) => {
    const state = get();
    const result = buyBuildingUpgrade(state.resources, state.buildings, buildingId);
    if (result) {
      set({ ...result, telemetry: trackFirstOccurrence(state.telemetry, 'first_building_upgrade', { buildingId }) });
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
      set({ ...result, telemetry: trackFirstOccurrence(state.telemetry, 'first_hire', { role }) });
    }
  },

  assign: (role, buildingId, delta) => {
    const state = get();
    const staff = adjustStaffAssignment(state.staff, role, buildingId, delta, state.buildings[buildingId].level);
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
    const result = startCertification(state.resources, state.certifications, testId, Date.now());
    if (result) {
      set({ ...result, telemetry: trackFirstOccurrence(state.telemetry, 'first_certification_started', { testId }) });
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

    set({
      resources: certificationResolution.resources,
      buildings,
      processes,
      staff: staffAfterCompletions,
      research: researchResolution.research,
      certifications: certificationResolution.certifications,
      narrative: { ...state.narrative, seen: certificationResolution.narrativeSeen },
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
