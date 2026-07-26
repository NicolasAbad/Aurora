import type { HardwareState, HardwareTier } from './types';

// ECONOMY §5 Materials tree: Aluminum (starting tier) -> Titanium. Tech id follows the
// existing camelCase-of-doc-name convention already used by unlockConditions ahead of
// Sprint 4's real research tree (e.g. 'testStand', 'flightProgram').
const TITANIUM_TECH_ID = 'titanium';

// GDD §1 / CLAUDE.md schema note: "Composites v2" — the tier ordering below is written
// to extend by just appending, whenever that tier becomes real content.
const TIER_ORDER: HardwareTier[] = ['aluminum', 'titanium'];

/** Hardware at `tier` or higher (CLAUDE.md schema: "Costs may demand a minimum tier").
 * v1 only has two tiers, so "minTier titanium" in practice means titanium specifically —
 * this still generalizes correctly once Composites lands. */
export function hardwareAtOrAboveTier(hardware: HardwareState, tier: HardwareTier): number {
  const startIndex = TIER_ORDER.indexOf(tier);
  return TIER_ORDER.slice(startIndex).reduce((sum, t) => sum + hardware.byTier[t], 0);
}

/** Deducts `amount` Hardware, preferring the lowest tier at/above `minTier` first (keeps
 * scarce higher-tier stock available for other minTier-gated costs where possible).
 * Caller must have already confirmed affordability via hardwareAtOrAboveTier. */
export function spendHardware(
  hardware: HardwareState,
  amount: number,
  minTier: HardwareTier = 'aluminum',
): HardwareState {
  let remaining = amount;
  const byTier = { ...hardware.byTier };
  for (const tier of TIER_ORDER.slice(TIER_ORDER.indexOf(minTier))) {
    if (remaining <= 0) break;
    const take = Math.min(byTier[tier], remaining);
    byTier[tier] -= take;
    remaining -= take;
  }
  return { ...hardware, amount: hardware.amount - (amount - remaining), byTier };
}

/** GDD §1 ("Hardware tiers") / ECONOMY §4: "Fabrication produces at its current tier" — the highest
 * Materials-tree tier researched so far. Starts Aluminum; switches to Titanium once
 * researched (production moves to the new tier, it doesn't blend across both). */
export function currentHardwareTier(completedTech: string[]): HardwareTier {
  return completedTech.includes(TITANIUM_TECH_ID) ? 'titanium' : 'aluminum';
}

/** Credits `amount` Hardware at `tier` into byTier, keeping `amount`/`lifetimeEarned` in
 * sync with the sum(byTier) invariant (CLAUDE.md schema note). Halts at cap like any
 * other passive production (GDD §1c) — the cap is shared across tiers. */
export function creditHardware(
  hardware: HardwareState,
  amount: number,
  tier: HardwareTier,
): HardwareState {
  if (amount <= 0) return hardware;
  const room = hardware.cap === null ? amount : Math.max(0, hardware.cap - hardware.amount);
  const added = Math.min(amount, room);
  if (added <= 0) return hardware;
  return {
    ...hardware,
    amount: hardware.amount + added,
    lifetimeEarned: hardware.lifetimeEarned + added,
    byTier: { ...hardware.byTier, [tier]: hardware.byTier[tier] + added },
  };
}
