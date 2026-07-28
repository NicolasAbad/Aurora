import { resolveEconomyTick } from './economy';
import { resolveProcesses } from './time';
import type { GameState, Modifier, Process, StaffState } from './types';

export const OFFLINE_RATE = 0.6; // ECONOMY §11: "resources and salaries at 60%"
export const OFFLINE_CAP_MS = 10 * 60 * 60 * 1000; // 10h base; Remote Ops extends to 16h (Sprint 4 modifier)
const CHUNK_MS = 60_000; // resolved in 1-min steps, matching the online tick's granularity

export interface PayrollStoppage {
  startedAtMs: number; // offset from the start of the offline window
  durationMs: number; // total time spent unpaid within this window (may span >1 stretch)
}

export interface OfflineResolution {
  resources: GameState['resources'];
  buildings: GameState['buildings']; // starvedIndicator/fedStreakMs resolved through the gap
  payrollUnpaid: boolean; // state at the END of the resolved window
  elapsedMs: number; // real elapsed time since lastSeenAt (uncapped)
  appliedMs: number; // portion actually resolved (capped at offlineCapMs)
  capped: boolean; // true if elapsedMs > offlineCapMs — some offline time went uncompensated
  stoppage: PayrollStoppage | null;
  processes: Process[]; // remaining (incomplete) processes
  completedProcesses: Process[]; // finished while away; caller applies any kind-specific effect
}

/**
 * Resolves economy state across an offline gap by calling `resolveEconomyTick` — the
 * SAME function the online game loop calls every frame — repeatedly in 1-min chunks at
 * OFFLINE_RATE, for up to `offlineCapMs` of the actual elapsed gap. This is what
 * CLAUDE.md rule 6 means by "offline reuses the exact same resolution logic as
 * online": not an approximation of it, the identical function, just called more times
 * to cover a longer real-world gap. Chunking (rather than one giant tick) is what lets
 * insolvency be detected and reported mid-window instead of only all-or-nothing.
 */
export function resolveOffline(
  resources: GameState['resources'],
  buildings: GameState['buildings'],
  staff: StaffState,
  completedTech: string[],
  processes: Process[],
  lastSeenAt: number,
  now: number,
  offlineCapMs: number = OFFLINE_CAP_MS,
  wasPayrollUnpaid = false,
  modifiers: Modifier[] = [],
): OfflineResolution {
  const elapsedMs = Math.max(0, now - lastSeenAt);
  const appliedMs = Math.min(elapsedMs, offlineCapMs);

  let currentResources = resources;
  let currentBuildings = buildings;
  let stoppageStartMs: number | null = null;
  let stoppageDurationMs = 0;
  // Carries forward the state at close when no chunk runs at all (appliedMs === 0, e.g.
  // a clock rewind or a same-instant reload) — without this, zero elapsed time would
  // silently report solvency regardless of what was actually true when the player left.
  let payrollUnpaid = wasPayrollUnpaid;
  let elapsedSoFar = 0;
  let remaining = appliedMs;

  while (remaining > 0) {
    const chunk = Math.min(CHUNK_MS, remaining);
    const result = resolveEconomyTick(
      currentResources,
      currentBuildings,
      staff,
      completedTech,
      chunk,
      OFFLINE_RATE,
      modifiers,
      now,
    );
    currentResources = result.resources;
    currentBuildings = result.buildings;
    payrollUnpaid = result.payrollUnpaid;

    if (payrollUnpaid) {
      if (stoppageStartMs === null) stoppageStartMs = elapsedSoFar;
      stoppageDurationMs += chunk;
    }

    elapsedSoFar += chunk;
    remaining -= chunk;
  }

  // ECONOMY §11: processes resolve at 100% regardless of the resource offline cap — a
  // process's own `startedAt + durationMs` is compared against the real `now`, entirely
  // independent of `appliedMs`. Same `resolveProcesses` call the online tick uses (rule 6).
  const { completed: completedProcesses, remaining: remainingProcesses } = resolveProcesses(
    processes,
    now,
  );

  return {
    resources: currentResources,
    buildings: currentBuildings,
    payrollUnpaid,
    elapsedMs,
    appliedMs,
    capped: elapsedMs > offlineCapMs,
    stoppage: stoppageStartMs !== null ? { startedAtMs: stoppageStartMs, durationMs: stoppageDurationMs } : null,
    processes: remainingProcesses,
    completedProcesses,
  };
}
