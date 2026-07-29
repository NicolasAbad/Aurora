// ECONOMY_MODEL.md §9: Flight Experience trees (XP cost) — the prestige replacement
// (GDD §9). Mirrors data/researchTree.ts's shape (id/branch/cost/deps/declarative
// `effect`) exactly, so core/flightXp.ts's modifierForXpNode can reuse
// researchTree.ts's modifierForNode pattern verbatim. `mechanicChange: true` marks the
// two nodes GDD §9 calls out as changing a mechanic rather than scaling a percentage
// (Partial reusability, Parallel integration) — these have no declarative `effect` and
// are handled by dedicated logic at their point of use instead.
import type { Modifier } from '../core/types';

export interface XpNode {
  id: string;
  name: string;
  branch: 'propulsion' | 'operations' | 'organization' | 'prestige';
  costXp: number;
  deps: string[];
  effect?: { target: string; op: 'mult' | 'add'; value: number };
  mechanicChange?: boolean;
}

export const XP_TREE: XpNode[] = [
  // --- Propulsion ---
  {
    id: 'efficientMixtures',
    name: 'Efficient mixtures',
    branch: 'propulsion',
    costXp: 100,
    deps: [],
    effect: { target: 'launch.propellant', op: 'mult', value: 0.9 }, // -10%
  },
  {
    id: 'optimizedIgnition',
    name: 'Optimized ignition',
    branch: 'propulsion',
    costXp: 250,
    deps: ['efficientMixtures'],
    effect: { target: 'certification.duration', op: 'mult', value: 0.8 }, // -20%
  },
  {
    id: 'partialReusability',
    name: 'Partial reusability',
    branch: 'propulsion',
    costXp: 600,
    deps: ['optimizedIgnition'],
    mechanicChange: true, // recover 20% Propellant — core/flightXp.ts's PARTIAL_REUSABILITY_RECOVERY_RATE
  },
  // --- Operations ---
  {
    id: 'procedures',
    name: 'Procedures',
    branch: 'operations',
    costXp: 100,
    deps: [],
    effect: { target: 'integration.duration', op: 'mult', value: 0.9 }, // -10%
  },
  {
    id: 'turnaround',
    name: 'Turnaround',
    branch: 'operations',
    costXp: 300,
    deps: ['procedures'],
    // Reuses the SAME 'transfer.duration' target Basic logistics (research tree)
    // already registers — the two are meant to stack multiplicatively.
    effect: { target: 'transfer.duration', op: 'mult', value: 0.7 }, // -30%
  },
  {
    id: 'parallelIntegration',
    name: 'Parallel integration',
    branch: 'operations',
    costXp: 700,
    deps: ['turnaround'],
    mechanicChange: true, // deferred — see Sprint 10 design-question thread
  },
  // --- Organization ---
  {
    id: 'teamCulture',
    name: 'Team culture',
    branch: 'organization',
    costXp: 150,
    deps: [],
    effect: { target: 'salary.rate', op: 'mult', value: 0.95 }, // -5%
  },
  {
    id: 'recruiting',
    name: 'Recruiting',
    branch: 'organization',
    costXp: 400,
    deps: ['teamCulture'],
    effect: { target: 'hiring.cost', op: 'mult', value: 0.85 }, // -15%
  },
  // --- Prestige ---
  {
    id: 'publicRelations',
    name: 'Public relations',
    branch: 'prestige',
    costXp: 150,
    deps: [],
    effect: { target: 'reputation.gain', op: 'mult', value: 1.2 }, // +20%
  },
  {
    id: 'trustedBrand',
    name: 'Trusted brand',
    branch: 'prestige',
    costXp: 450,
    deps: ['publicRelations'],
    effect: { target: 'contract.pay', op: 'mult', value: 1.25 }, // +25%
  },
];

export const XP_TREE_BY_ID: Map<string, XpNode> = new Map(XP_TREE.map((n) => [n.id, n]));

/** Mirrors data/researchTree.ts's modifierForNode: builds the registered Modifier for a
 * purchased node's declarative effect, or null for mechanic-change nodes (handled
 * separately) or effect-less nodes. */
export function modifierForXpNode(node: XpNode): Modifier | null {
  if (!node.effect) return null;
  return { id: `xp:${node.id}`, source: node.id, ...node.effect };
}
