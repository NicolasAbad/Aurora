import type { Modifier } from './types';

/**
 * CLAUDE.md rule 4: every bonus (tech, internal upgrade, XP node, event outcome)
 * registers a Modifier; systems query them here rather than hardcoding a bonus inline.
 *
 * v1 only ever registers at most one modifier per target (research tree effects are
 * the sole source so far — see data/researchTree.ts) — composition order for multiple
 * simultaneous modifiers on the same target is intentionally undecided here, deferred
 * to whichever future sprint first registers a second one on a target that already has
 * one. Sequential in-array-order application (add, or multiply, applied one at a time)
 * is what's implemented; do not read that as a settled design for the multi-modifier
 * case.
 */
export function applyModifiers(baseValue: number, modifiers: Modifier[], target: string): number {
  return modifiers
    .filter((m) => m.target === target)
    .reduce((value, m) => (m.op === 'mult' ? value * m.value : value + m.value), baseValue);
}

export function registerModifier(modifiers: Modifier[], modifier: Modifier): Modifier[] {
  if (modifiers.some((m) => m.id === modifier.id)) return modifiers; // already registered
  return [...modifiers, modifier];
}
