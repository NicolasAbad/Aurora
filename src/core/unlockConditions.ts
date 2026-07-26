import type { GameState, UnlockCondition } from './types';

// Narrow slice of GameState — only what any UnlockCondition variant actually reads.
// `auroraISuccess` isn't its own flag anywhere in the schema; it's derived from
// mission.launches (LaunchRecord already has `missionType`/`success`), so this context
// is built once per check rather than duplicating that derivation at every call site.
export interface UnlockContext {
  lifetimeFunding: number;
  completedTech: string[];
  reputation: number;
  auroraISuccess: boolean;
  buildings: GameState['buildings'];
}

export function unlockContextFromState(state: GameState): UnlockContext {
  return {
    lifetimeFunding: state.resources.funding.lifetimeEarned,
    completedTech: state.research.completed,
    reputation: state.resources.reputation.amount,
    auroraISuccess: state.mission.launches.some((l) => l.missionType === 'auroraI' && l.success),
    buildings: state.buildings,
  };
}

/** Generic evaluator for every UnlockCondition variant (core/types.ts) — the single
 * place that gives the field real teeth, rather than each caller (ComplexTabs,
 * building-tile visibility) re-deriving its own ad hoc check per condition kind. */
export function isUnlockConditionMet(condition: UnlockCondition, ctx: UnlockContext): boolean {
  switch (condition.kind) {
    case 'start':
      return true;
    case 'locked':
      return false;
    case 'lifetimeFunding':
      return ctx.lifetimeFunding >= condition.amount;
    case 'tech':
      return ctx.completedTech.includes(condition.id);
    case 'reputation':
      return ctx.reputation >= condition.amount;
    case 'auroraISuccess':
      return ctx.auroraISuccess;
    case 'buildingLevel':
      return ctx.buildings[condition.building].level >= condition.level;
    case 'all':
      return condition.conditions.every((c) => isUnlockConditionMet(c, ctx));
  }
}
