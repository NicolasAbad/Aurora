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
function isExpired(modifier: Modifier, now: number): boolean {
  return modifier.expiresAt !== undefined && modifier.expiresAt <= now;
}

/** `now` is required (rule 6: /core takes time as a parameter, never reads the clock
 * itself) so a modifier past its `expiresAt` is excluded at query time even if it
 * hasn't been pruned from the array yet. */
export function applyModifiers(
  baseValue: number,
  modifiers: Modifier[],
  target: string,
  now: number,
): number {
  return modifiers
    .filter((m) => m.target === target && !isExpired(m, now))
    .reduce((value, m) => (m.op === 'mult' ? value * m.value : value + m.value), baseValue);
}

export function registerModifier(modifiers: Modifier[], modifier: Modifier): Modifier[] {
  if (modifiers.some((m) => m.id === modifier.id)) return modifiers; // already registered
  return [...modifiers, modifier];
}

/**
 * Drops expired modifiers outright, unlike applyModifiers' query-time filter which
 * leaves them in the array. Called at save, at load, and at offline-gap resolution
 * (state/persistStore.ts) — the Modifier.expiresAt contract (CLAUDE.md): an offline
 * gap can never leave a stale effect applied, and the persisted array doesn't grow
 * unboundedly as timed event effects (E-05, Sprint 9) come and go.
 */
export function pruneExpiredModifiers(modifiers: Modifier[], now: number): Modifier[] {
  return modifiers.filter((m) => !isExpired(m, now));
}
