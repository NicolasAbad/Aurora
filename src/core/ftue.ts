// SPRINTS.md Sprint 8, task 1: "contextual one-time tooltips (NARRATIVE §2)." T-01..T-09
// were transcribed into NARRATIVE_EVENTS.md at v1 but never wired to a trigger — this is
// that wiring. T-06 ("Launch checklist") is deliberately excluded: its moment is "first
// time the player sees the Launch Sequence screen," a screen-mount event, not a game-state
// predicate — rendered directly by LaunchPanel via the same FirstEntryTip component T-16/
// T-17 already use (App.tsx), not through this module.
import { totalHired } from './staff';
import type { GameState, ResourceState } from './types';

// Priority order matches NARRATIVE §2's own table order — the natural onboarding
// sequence (pitch -> afford a hire -> hire -> see a timer -> ...).
export const FTUE_TOOLTIP_ORDER = ['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-07', 'T-08', 'T-09'] as const;

/** Is this tooltip's trigger condition currently true? Pure read of GameState — no
 * "seen" bookkeeping here, that's the caller's job (App.tsx's session-scoped dismiss
 * set, same treatment as T-16/T-17). */
export function ftueTooltipCondition(id: (typeof FTUE_TOOLTIP_ORDER)[number], state: GameState): boolean {
  switch (id) {
    case 'T-01':
      return true; // Start — eligible from the very first frame
    case 'T-02':
      return state.resources.funding.amount >= 50; // "afford your first technician" (hireStaff base cost)
    case 'T-03':
      return totalHired(state.staff) > 0; // First hire
    case 'T-04':
      // First timer: any process running, in any of the three places a Process can live
      // (the generic queue, or research/certification's own dedicated slot).
      return state.processes.length > 0 || !!state.research.inProgress || !!state.certifications.inProgress;
    case 'T-05':
      // Cap reached: any capped resource sitting at or above its cap right now.
      // `cap > 0` excludes Propellant's starting cap of 0 (no Propellant Depot yet) —
      // amount 0 >= cap 0 would otherwise read as "full" from the very first frame.
      return (Object.values(state.resources) as ResourceState[]).some(
        (r) => r.cap !== null && r.cap > 0 && r.amount >= r.cap,
      );
    case 'T-07':
      return state.economyFlags.payrollUnpaid; // UI_SPEC §4: "Tooltip T-07 fires the first time"
    case 'T-08':
      // VAB build starts: the first VAB stage has been paid for (stagesDone tracks
      // completed stages, but the checklist item / rocketStatus flips the moment
      // integration begins — rocketStatus leaves 'none' as soon as the first stage starts).
      return Object.values(state.mission.pads).some((pad) => pad && pad.rocketStatus !== 'none');
    case 'T-09':
      return state.buildings.rndLab.level >= 1 && state.staff.pools.scientist.hired === 0;
  }
}

/** The single tooltip due to show right now: the first (in NARRATIVE §2 order) whose
 * condition is true and whose id isn't in `dismissed` — at most one at a time, so
 * dismissing one naturally reveals the next eligible one on the following render. */
export function nextFtueTooltip(state: GameState, dismissed: ReadonlySet<string>): string | null {
  for (const id of FTUE_TOOLTIP_ORDER) {
    if (dismissed.has(id)) continue;
    if (ftueTooltipCondition(id, state)) return id;
  }
  return null;
}
