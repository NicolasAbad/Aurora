import type { Process } from './types';

/** Adds a process to the queue, stamped with the given start time. Pure — the caller
 * supplies `startedAt` (typically `Date.now()`); this never reads the clock itself. */
export function startProcess(
  processes: Process[],
  newProcess: Omit<Process, 'startedAt'>,
  startedAt: number,
): Process[] {
  return [...processes, { ...newProcess, startedAt }];
}

export interface ProcessResolution {
  completed: Process[];
  remaining: Process[];
}

/**
 * Timestamp-based resolution (CLAUDE.md rule 6): a process is done once
 * `startedAt + durationMs <= now`, regardless of how much real time has passed since
 * the last check — there's no tick counter to have drifted. This is what makes offline
 * resolution safe to call with an arbitrarily large `now` jump and get the same answer
 * as resolving it minute-by-minute would have. Any number of processes resolve
 * independently in one pass (parallel processes are just "more entries in the array").
 */
export function resolveProcesses(processes: Process[], now: number): ProcessResolution {
  const completed: Process[] = [];
  const remaining: Process[] = [];
  for (const p of processes) {
    if (p.startedAt + p.durationMs <= now) completed.push(p);
    else remaining.push(p);
  }
  return { completed, remaining };
}

/** Time left on a process, floored at 0 (never negative once it's actually complete). */
export function remainingMs(process: Process, now: number): number {
  return Math.max(0, process.startedAt + process.durationMs - now);
}

/** Completion fraction in [0, 1], for progress bars. */
export function progressFraction(process: Process, now: number): number {
  if (process.durationMs <= 0) return 1;
  const elapsed = now - process.startedAt;
  return Math.max(0, Math.min(1, elapsed / process.durationMs));
}
