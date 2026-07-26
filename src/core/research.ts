import { modifierForNode, RESEARCH_BY_ID, type ResearchNode } from '../data/researchTree';
import { registerModifier } from './modifiers';
import type { Modifier, Process } from './types';

export interface ResearchState {
  completed: string[];
  inProgress: Process | null;
}

/** Deps met and not already completed — the node could be started right now. */
export function isNodeAvailable(node: ResearchNode, completed: string[]): boolean {
  return !completed.includes(node.id) && node.deps.every((d) => completed.includes(d));
}

/**
 * UI_SPEC §2b: "a node renders only if it's available (deps met) or exactly one
 * prerequisite away." Done/available nodes are visible outright; a locked node is also
 * visible if every one of its deps is itself completed-or-available — i.e. the reveal
 * front extends exactly one ring past the completed frontier, never further.
 */
export function isNodeVisible(node: ResearchNode, completed: string[]): boolean {
  if (completed.includes(node.id) || isNodeAvailable(node, completed)) return true;
  return node.deps.every((d) => {
    if (completed.includes(d)) return true;
    const depNode = RESEARCH_BY_ID.get(d);
    return depNode ? isNodeAvailable(depNode, completed) : false;
  });
}

export interface ResearchResolution {
  research: ResearchState;
  modifiers: Modifier[];
  justCompleted: string | null;
}

/**
 * Timestamp-based (CLAUDE.md rule 6): a node is done once `startedAt + durationMs <=
 * now`, checked against the real clock — the same call online and offline resolution
 * both make. "One node at a time in v1" means this never auto-starts the next node even
 * if the offline gap runs well past this one's duration; `inProgress` just goes null.
 */
export function resolveResearch(
  research: ResearchState,
  modifiers: Modifier[],
  now: number,
): ResearchResolution {
  const process = research.inProgress;
  if (!process || now < process.startedAt + process.durationMs) {
    return { research, modifiers, justCompleted: null };
  }

  const nodeId = process.payload.nodeId as string;
  const node = RESEARCH_BY_ID.get(nodeId);
  const modifier = node ? modifierForNode(node) : null;

  return {
    research: { completed: [...research.completed, nodeId], inProgress: null },
    modifiers: modifier ? registerModifier(modifiers, modifier) : modifiers,
    justCompleted: nodeId,
  };
}
