// ECONOMY_MODEL.md §9 / GDD §9: Flight Experience trees. Purchases are instant
// one-time spends of Flight XP (no timer, no Process) — mirrors core/actions.ts's
// buyInternalUpgrade shape, not core/research.ts's timed-process shape.
import { modifierForXpNode, XP_TREE_BY_ID, type XpNode } from '../data/flightXpTree';
import { registerModifier } from './modifiers';
import type { GameState, Modifier } from './types';

export const DEFAULT_FLIGHT_XP_TREE_STATE: { purchased: string[] } = { purchased: [] };

/** Deps met and not already owned — mirrors core/research.ts's isNodeAvailable. */
export function isXpNodeAvailable(node: XpNode, purchased: string[]): boolean {
  return !purchased.includes(node.id) && node.deps.every((d) => purchased.includes(d));
}

/** UI_SPEC §2b progressive-disclosure rule, same "one ring past the frontier" reveal
 * core/research.ts's isNodeVisible already established for the Research tab. */
export function isXpNodeVisible(node: XpNode, purchased: string[]): boolean {
  if (purchased.includes(node.id) || isXpNodeAvailable(node, purchased)) return true;
  return node.deps.every((d) => {
    if (purchased.includes(d)) return true;
    const depNode = XP_TREE_BY_ID.get(d);
    return depNode ? isXpNodeAvailable(depNode, purchased) : false;
  });
}

export interface BuyXpNodeResult {
  resources: GameState['resources'];
  flightXpTree: { purchased: string[] };
  modifiers: Modifier[];
}

// Sprint 10 design-question thread: "two stages at once" isn't resolvable without
// design input — a literal auto-chain reading is redundant with the already-shipped
// vabQueues research node, and a true-concurrent-timers reading needs its own overlap
// rule specified before it can be built (see the exported Aurora II / Parallel
// integration question set). Cost/deps/position are real ECONOMY §9 data and stay in
// XP_TREE; only the PURCHASE is refused here, same "visible, priced, but not yet live"
// treatment data/buildings.ts's Training Center teaser already uses for deferred content.
export const XP_NODES_PENDING_DESIGN: readonly string[] = ['parallelIntegration'];

/**
 * Instant one-time purchase — spends Flight XP, registers the node's declarative
 * Modifier immediately (rule 4). Mechanic-change nodes (Partial reusability, Parallel
 * integration) have no `effect` and register nothing here; their behavior is checked
 * directly by id at the point of use, same "feature toggle, not a numeric modifier"
 * pattern data/researchTree.ts's vabQueues/autoRefuel already use.
 */
export function buyXpNode(
  resources: GameState['resources'],
  flightXpTree: { purchased: string[] },
  modifiers: Modifier[],
  nodeId: string,
): BuyXpNodeResult | null {
  const node = XP_TREE_BY_ID.get(nodeId);
  if (!node || !isXpNodeAvailable(node, flightXpTree.purchased)) return null;
  if (XP_NODES_PENDING_DESIGN.includes(nodeId)) return null;
  if (resources.flightxp.amount < node.costXp) return null;

  const modifier = modifierForXpNode(node);
  return {
    resources: {
      ...resources,
      flightxp: { ...resources.flightxp, amount: resources.flightxp.amount - node.costXp },
    },
    flightXpTree: { purchased: [...flightXpTree.purchased, nodeId] },
    modifiers: modifier ? registerModifier(modifiers, modifier) : modifiers,
  };
}

// ECONOMY §9: Partial reusability — "recover 20% Propellant" (mechanic change, not a
// declarative Modifier — no single `target` in the applyModifiers vocabulary fits "credit
// some of a just-spent resource back", unlike a plain rate/duration scale). Applied at
// whichever point a mission actually deducts Propellant (core/soundingMission.ts's
// launchSoundingMission; core/auroraMission.ts's and core/contractMission.ts's
// propellantLoad stage) — credited back immediately, unconditional of launch outcome (a
// fuel-efficiency upgrade, not a risk-mitigation one like the failure-recovery rules).
export const PARTIAL_REUSABILITY_RECOVERY_RATE = 0.2;

export function recoveredPropellant(spent: number, purchased: string[]): number {
  return purchased.includes('partialReusability') ? spent * PARTIAL_REUSABILITY_RECOVERY_RATE : 0;
}
