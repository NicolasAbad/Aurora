// SPRINTS.md Sprint 8, task 1: "contextual one-time tooltips (NARRATIVE §2)." T-01..T-09
// were transcribed into NARRATIVE_EVENTS.md at v1 but never wired to a trigger — this is
// that wiring. T-06 ("Launch checklist") is deliberately excluded: its moment is "first
// time the player sees the Launch Sequence screen," a screen-mount event, not a game-state
// predicate — rendered directly by LaunchPanel via the same FirstEntryTip component T-16/
// T-17 already use (App.tsx), not through this module.
import { totalHired } from './staff';
import type { GameState, ResourceState } from './types';

// Priority order matches NARRATIVE §2's own table order — the natural onboarding
// sequence (pitch -> afford a hire -> hire -> see a timer -> ...). T-24/T-25 (Sprint 9.5,
// NARRATIVE §9) are appended: both are naturally later-game than the original Campus-
// focused T-01..T-09, and between themselves, T-24 (any mission's Confidence below 100 —
// reachable via a sonda) chronologically precedes T-25 (Aurora I's first VAB stage
// specifically) in a typical playthrough.
export const FTUE_TOOLTIP_ORDER = [
  'T-01',
  'T-02',
  'T-03',
  'T-04',
  'T-05',
  'T-07',
  'T-08',
  'T-09',
  'T-24',
  'T-25',
] as const;

/** Is this tooltip's trigger condition currently true? Pure read of GameState — no
 * "seen" bookkeeping here, that's the caller's job (App.tsx's session-scoped dismiss
 * set, same treatment as T-16/T-17). */
export function ftueTooltipCondition(id: (typeof FTUE_TOOLTIP_ORDER)[number], state: GameState): boolean {
  switch (id) {
    case 'T-01':
      return true; // Start — eligible from the very first frame
    case 'T-02':
      // "Afford your first technician" (hireStaff base cost) — CLAUDE.md rule 13 / NARRATIVE
      // v3.6: fixed real bug, this used to check Funding alone, predating the Campus
      // staged-reveal rules (UI_SPEC §2d); hiring itself is gated on Finance existing
      // (StaffHiring only renders once financeLevel >= 1, App.tsx), so a Funding-only
      // check could fire before hiring was even reachable. Both conditions now required.
      return state.buildings.finance.level >= 1 && state.resources.funding.amount >= 50;
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
      // CLAUDE.md rule 13: real bug found alongside T-02/D-10's own fixes — this text
      // names the Propellant Depot ("Your Depot holds 250 per level"), but the Program
      // branch (basicEngineering -> ... -> flightProgram, which unlocks the VAB) is
      // entirely independent of the Propulsion branch's `soundingRockets` node, which is
      // what actually reveals the Propellant Depot tile (UI_SPEC §2e step 3,
      // ProductionPanel's refineryAndPropDepotRevealed). A player can start VAB
      // integration (any stage before 'engines', which alone requires Orbital-1
      // certified) having never researched soundingRockets at all — this tooltip would
      // then reference a building the player has never seen. Now requires that reveal
      // condition too.
      return (
        state.research.completed.includes('soundingRockets') &&
        Object.values(state.mission.pads).some((pad) => pad && pad.rocketStatus !== 'none')
      );
    case 'T-09':
      return state.buildings.rndLab.level >= 1 && state.staff.pools.scientist.hired === 0;
    case 'T-24':
      // NARRATIVE §9 (Sprint 9.5): "the first time Confidence shows below 100%, any
      // mission." Gated on a mission actually being in flight (not just the pad/sounding
      // slot's resting default of 0) so this doesn't fire from frame 1 with nothing going on.
      return (
        (state.mission.sounding !== null && state.mission.sounding.confidence < 100) ||
        Object.values(state.mission.pads).some((pad) => pad && pad.rocketStatus !== 'none' && pad.confidence < 100)
      );
    case 'T-25':
      // "Immediately before Aurora I's VAB integration begins (its first stage started)"
      // — same trigger T-08 already uses (rocketStatus leaves 'none' the moment the first
      // stage starts); the FTUE queue naturally shows whichever of the two is due first
      // and reveals the other on dismiss, same "at most one at a time" rule as always.
      return Object.values(state.mission.pads).some((pad) => pad && pad.rocketStatus !== 'none');
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
