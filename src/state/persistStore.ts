import { create } from 'zustand';
import { createInitialState } from '../data/initialState';
import type { BuildingId, GameState, RoleId } from '../core/types';
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations';
import { adjustStaffAssignment, applyPitch, buyBuildingUpgrade, hireStaff } from '../core/actions';
import { resolveEconomyTick } from '../core/economy';
import { OFFLINE_CAP_MS, resolveOffline, type PayrollStoppage } from '../core/offlineResolution';
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
    return migrated as unknown as GameState;
  } catch {
    // Corrupt save: never crash the app on load (Sprint 8 adds a user-facing import
    // validation path for the Settings screen; this is the silent boot-time fallback).
    return createInitialState();
  }
}

/** Every save stamps the current time as `lastSeenAt` — however the session ends
 * (clean unload, tab kill, crash), the next load's offline-gap calc starts from the
 * last successful save, not a stale value from hours earlier. */
export function saveGame(state: GameState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastSeenAt: Date.now() }));
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
  const offline = resolveOffline(loaded.resources, loaded.buildings, loaded.staff, loaded.lastSeenAt, now, OFFLINE_CAP_MS);

  const initialState: GameState = {
    ...loaded,
    resources: offline.resources,
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
          researchGained: offline.resources.research.amount - loaded.resources.research.amount,
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
  /** No-ops if the role isn't tech-unlocked, is unaffordable, or the staff cap is full. */
  hire: (role: RoleId) => void;
  /** delta is typically +1/-1 from a UI stepper; no-ops if it would violate slots/hired. */
  assign: (role: RoleId, buildingId: BuildingId, delta: number) => void;
  /** Called once per animation frame by the game loop (see core/tick.ts + main.tsx). */
  applyTick: (deltaMs: number) => void;
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
    const staff = adjustStaffAssignment(state.staff, role, buildingId, delta);
    if (staff) set({ staff });
  },

  applyTick: (deltaMs) => {
    const state = get();
    const { resources, payrollUnpaid } = resolveEconomyTick(
      state.resources,
      state.buildings,
      state.staff,
      deltaMs,
    );
    set({ resources, economyFlags: { ...state.economyFlags, payrollUnpaid } });
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
