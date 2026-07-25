import { resolveEconomyTick } from './economy';
import type { GameState, StaffState } from './types';

export const OFFLINE_RATE = 0.6; // ECONOMY §11: "resources and salaries at 60%"
export const OFFLINE_CAP_MS = 10 * 60 * 60 * 1000; // 10h base; Remote Ops extends to 16h (Sprint 4 modifier)
const CHUNK_MS = 60_000; // resolved in 1-min steps, matching the online tick's granularity

export interface PayrollStoppage {
  startedAtMs: number; // offset from the start of the offline window
  durationMs: number; // total time spent unpaid within this window (may span >1 stretch)
}

export interface OfflineResolution {
  resources: GameState['resources'];
  payrollUnpaid: boolean; // state at the END of the resolved window
  elapsedMs: number; // real elapsed time since lastSeenAt (uncapped)
  appliedMs: number; // portion actually resolved (capped at offlineCapMs)
  capped: boolean; // true if elapsedMs > offlineCapMs — some offline time went uncompensated
  stoppage: PayrollStoppage | null;
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
  lastSeenAt: number,
  now: number,
  offlineCapMs: number = OFFLINE_CAP_MS,
): OfflineResolution {
  const elapsedMs = Math.max(0, now - lastSeenAt);
  const appliedMs = Math.min(elapsedMs, offlineCapMs);

  let currentResources = resources;
  let stoppageStartMs: number | null = null;
  let stoppageDurationMs = 0;
  let payrollUnpaid = false;
  let elapsedSoFar = 0;
  let remaining = appliedMs;

  while (remaining > 0) {
    const chunk = Math.min(CHUNK_MS, remaining);
    const result = resolveEconomyTick(currentResources, buildings, staff, chunk, OFFLINE_RATE);
    currentResources = result.resources;
    payrollUnpaid = result.payrollUnpaid;

    if (payrollUnpaid) {
      if (stoppageStartMs === null) stoppageStartMs = elapsedSoFar;
      stoppageDurationMs += chunk;
    }

    elapsedSoFar += chunk;
    remaining -= chunk;
  }

  return {
    resources: currentResources,
    payrollUnpaid,
    elapsedMs,
    appliedMs,
    capped: elapsedMs > offlineCapMs,
    stoppage: stoppageStartMs !== null ? { startedAtMs: stoppageStartMs, durationMs: stoppageDurationMs } : null,
  };
}
