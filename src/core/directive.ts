// UI_SPEC §2h (Sprint 9.5, NEW): the Current Directive — a persistent, dynamic "what now"
// indicator, addressing a confusion pattern (why launch this, what does this do, what's
// next) that recurred across multiple unrelated features in playtesting. Extends the
// FTUE tooltip system (core/ftue.ts) into an ongoing feature, but unlike FTUE tooltips
// (dismissed once seen — see ftue.ts's own header note), a directive has NO dismiss
// state: it's recomputed live every render and just changes as state changes, same
// "first true condition in priority order wins" shape as nextFtueTooltip. D-01..D-12
// (NARRATIVE §11) are the initial set; SPRINTS.md's own text says the pattern extends
// naturally to later content — not pre-built ahead of that content existing (rule 1).
import { BUILDINGS } from '../data/buildings';
import { costAtLevel } from './economy';
import { totalHired, totalStaffCap } from './staff';
import type { GameState } from './types';

export const DIRECTIVE_ORDER = [
  'D-01',
  'D-02',
  'D-03',
  'D-04',
  'D-05',
  'D-06',
  'D-07',
  'D-08',
  'D-09',
  'D-10',
  'D-11',
  'D-12',
] as const;

function financeCost(state: GameState): number {
  return (
    costAtLevel(BUILDINGS.finance.baseCost, BUILDINGS.finance.costFactor, state.buildings.finance.level).funding ?? 0
  );
}

function crewQuartersCost(state: GameState): number {
  return (
    costAtLevel(BUILDINGS.crewQuarters.baseCost, BUILDINGS.crewQuarters.costFactor, state.buildings.crewQuarters.level)
      .funding ?? 0
  );
}

/** Is this directive's condition currently true? D-01/D-02 and D-04's "affordable" checks
 * make the early pitch/build pair mutually exclusive (D-01: not yet affordable, D-02:
 * affordable) rather than the broader "not built yet" swallowing both — directives have
 * no dismiss set to fall back on the way FTUE tooltips do, so each must be self-contained. */
export function directiveCondition(id: (typeof DIRECTIVE_ORDER)[number], state: GameState): boolean {
  switch (id) {
    case 'D-01':
      return state.buildings.finance.level === 0 && state.resources.funding.amount < financeCost(state);
    case 'D-02':
      return state.buildings.finance.level === 0 && state.resources.funding.amount >= financeCost(state);
    case 'D-03':
      return state.buildings.finance.level >= 1 && totalHired(state.staff) === 0;
    case 'D-04':
      return (
        totalHired(state.staff) >= totalStaffCap(state.buildings.crewQuarters.level) &&
        state.resources.funding.amount >= crewQuartersCost(state)
      );
    case 'D-05':
      return state.buildings.rndLab.level >= 1 && state.staff.pools.scientist.hired === 0;
    case 'D-06':
      return state.resources.research.amount > 0 && !state.research.inProgress && !state.research.secondInProgress;
    case 'D-07':
      return state.resources.funding.lifetimeEarned >= 300 && state.buildings.supplyDepot.level === 0;
    case 'D-08':
      return state.buildings.testStand.level >= 1 && !state.certifications.engines.probe1.certified;
    case 'D-09':
      return (
        state.certifications.engines.probe1.certified &&
        !state.mission.launches.some((l) => l.missionType === 's1' || l.missionType === 's2')
      );
    case 'D-10':
      // CLAUDE.md rule 13: real bug found alongside T-02's fix — `pastKarman` only
      // requires the Propulsion tech branch (soundingRockets -> probe1Engine), which is
      // entirely independent of the Program branch's `flightProgram` node that actually
      // unlocks the Launch complex (ComplexTabs.tsx's LAUNCH_UNLOCK_TECH, where the VAB
      // lives) — a player can reach an S-2 success well before researching that far,
      // during which this directive would tell them to build a building they can't even
      // see yet. Now requires the Launch complex to actually be unlocked too.
      return (
        state.records.includes('pastKarman') &&
        state.buildings.vab.level === 0 &&
        state.research.completed.includes('flightProgram')
      );
    case 'D-11':
      return Object.values(state.mission.pads).some(
        (pad) => pad && pad.contractId == null && pad.rocketStatus !== 'none',
      );
    case 'D-12':
      return state.records.includes('firstOrbit') && state.contracts.active.length === 0;
  }
}

/** The single most relevant directive right now, or null once nothing in D-01..D-12
 * applies (very early pre-D-01 impossible states aside, this only happens once the
 * player has progressed past every defined directive — a later sprint's own content
 * extends this list, per SPRINTS.md's own note, rather than this falling back to a guess). */
export function currentDirective(state: GameState): string | null {
  for (const id of DIRECTIVE_ORDER) {
    if (directiveCondition(id, state)) return id;
  }
  return null;
}
