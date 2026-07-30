import { modifierForNode, RESEARCH_BY_ID, type ResearchNode } from '../data/researchTree';
import { registerModifier } from './modifiers';
import type { BuildingId, Modifier, Process } from './types';

export interface ResearchState {
  completed: string[];
  inProgress: Process | null;
  // ECONOMY §4 v3.6 (Sprint 8 economy unlock): R&D Lab's "Second research track"
  // upgrade. Additive optional (CLAUDE.md rule 5 — absent/undefined means exactly the
  // pre-v3.6 single-track behavior, no migration needed). Only ever populated once
  // `inProgress` is already occupied — see core/actions.ts's startResearch.
  secondInProgress?: Process | null;
}

/** ECONOMY §5b v4.1 (Sprint 11.5): a node's building prerequisite, if any, is built
 * (level >= 1) — separate from `deps`' tech chain (see data/researchTree.ts's own
 * header note on `buildingDep`). `buildingLevels` defaults to `{}` so every pre-v4.1
 * call site that omits it keeps exactly the old behavior (no node has ever declared
 * `buildingDep` before this, so the check is always trivially satisfied). */
function buildingDepMet(node: ResearchNode, buildingLevels: Partial<Record<BuildingId, number>>): boolean {
  return !node.buildingDep || (buildingLevels[node.buildingDep] ?? 0) >= 1;
}

/** Deps met and not already completed — the node could be started right now. */
export function isNodeAvailable(
  node: ResearchNode,
  completed: string[],
  buildingLevels: Partial<Record<BuildingId, number>> = {},
): boolean {
  return (
    !completed.includes(node.id) &&
    node.deps.every((d) => completed.includes(d)) &&
    buildingDepMet(node, buildingLevels)
  );
}

/**
 * UI_SPEC §2b: "a node renders only if it's available (deps met) or exactly one
 * prerequisite away." Done/available nodes are visible outright; a locked node is also
 * visible if every one of its deps is itself completed-or-available — i.e. the reveal
 * front extends exactly one ring past the completed frontier, never further. A node
 * whose tech deps are met but whose OWN buildingDep isn't yet still counts as visible
 * (the player needs to see "build the Test Stand" as the reason, not have it vanish).
 */
export function isNodeVisible(
  node: ResearchNode,
  completed: string[],
  buildingLevels: Partial<Record<BuildingId, number>> = {},
): boolean {
  if (completed.includes(node.id) || isNodeAvailable(node, completed, buildingLevels)) return true;
  if (!node.deps.every((d) => completed.includes(d) || isNodeAvailable(RESEARCH_BY_ID.get(d)!, completed, buildingLevels))) {
    return false;
  }
  return true;
}

export interface ResearchResolution {
  research: ResearchState;
  modifiers: Modifier[];
  // One id per node completed this call — up to 2 when both tracks (ECONOMY §4 v3.6)
  // finish in the same offline gap. Empty array = nothing completed (not null: a plain
  // array lets every call site `.includes(...)`/`.length` without a null check).
  justCompletedIds: string[];
}

/**
 * Timestamp-based (CLAUDE.md rule 6): a node is done once `startedAt + durationMs <=
 * now`, checked against the real clock — the same call online and offline resolution
 * both make. "One node at a time in v1" means this never auto-starts the next node even
 * if the offline gap runs well past this one's duration; the slot just goes null.
 * Resolves the primary and (if present) second-track (v3.6) slots independently — either,
 * neither, or both may complete in a single call.
 */
export function resolveResearch(
  research: ResearchState,
  modifiers: Modifier[],
  now: number,
): ResearchResolution {
  let nextCompleted = research.completed;
  let nextModifiers = modifiers;
  const justCompletedIds: string[] = [];

  function resolveSlot(process: Process | null | undefined): Process | null {
    if (!process || now < process.startedAt + process.durationMs) return process ?? null;
    const nodeId = process.payload.nodeId as string;
    const node = RESEARCH_BY_ID.get(nodeId);
    const modifier = node ? modifierForNode(node) : null;
    nextCompleted = [...nextCompleted, nodeId];
    nextModifiers = modifier ? registerModifier(nextModifiers, modifier) : nextModifiers;
    justCompletedIds.push(nodeId);
    return null;
  }

  const inProgress = resolveSlot(research.inProgress);
  const secondInProgress = resolveSlot(research.secondInProgress);

  if (justCompletedIds.length === 0) {
    return { research, modifiers, justCompletedIds };
  }

  return {
    research: { completed: nextCompleted, inProgress, secondInProgress },
    modifiers: nextModifiers,
    justCompletedIds,
  };
}
