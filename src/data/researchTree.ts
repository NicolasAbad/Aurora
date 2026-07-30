// ECONOMY_MODEL.md §5 (v2.9). Node ids match sim/run.ts's pre-existing RESEARCH array
// (built ahead of this sprint) exactly, so both stay in sync — see sim/run.ts's import.
import type { BuildingId, Modifier, ResourceId } from '../core/types';

const MIN = 60_000;
const HOUR = 60 * MIN;

export interface ResearchNode {
  id: string;
  name: string;
  branch: 'materials' | 'propulsion' | 'operations' | 'program';
  costR: number;
  durationMs: number;
  deps: string[];
  // ECONOMY §5b v4.1 (Sprint 11.5): a building this node ALSO requires built (level >=
  // 1), on top of `deps`' tech chain — e.g. Probe-1 engine research thematically implies
  // the Engine Test Stand exists to research it for. Absent = no building requirement
  // (every pre-v4.1 node), same additive-optional pattern as everywhere else.
  buildingDep?: BuildingId;
  // ECONOMY §5b v4.1: Funding/Materials alongside the Research cost, for nodes where
  // "this costs real money too" makes sense (certification-adjacent, building-unlocking)
  // — reserved for a subset, most nodes stay Research-only. Merged with `{ research:
  // costR }` at the two real call sites (core/actions.ts's startResearch, sim/run.ts) so
  // existing canAffordCost/payCost machinery handles it, no new cost-resolution path.
  secondaryCost?: Partial<Record<ResourceId, number>>;
  // Declarative modifier effect (CLAUDE.md rule 4) — omit id/source, callers stamp
  // those when registering. Most nodes have none: unlocking a building/role/tier is
  // checked directly by id elsewhere (e.g. core/hardware.ts's currentHardwareTier,
  // ROLES' unlockTech, BuildingDef.unlockCondition), not modeled as a numeric modifier.
  effect?: { target: string; op: 'mult' | 'add'; value: number };
  // NARRATIVE_EVENTS §8 (v3.5): every node's player-facing blurb, INCLUDING the
  // honest-zero-effect ones (aluminum/soundingRockets) — rule 9, "referenced by ID."
  // Unlike InternalUpgradeDef.narrativeId, §8 has no separate ID column: the node's own
  // `id` IS the key into data/narrative.ts's NARRATIVE_TEXT (see ResearchPanel.tsx's
  // narrativeText(node.id) call site). No literal field here to avoid a second,
  // driftable copy of the same string.
}

export const RESEARCH_TREE: ResearchNode[] = [
  // --- Materials ---
  {
    id: 'aluminum',
    name: 'Aluminum alloys',
    branch: 'materials',
    costR: 25,
    durationMs: 5 * MIN,
    deps: [],
    // v3.6 (Sprint 8 economy unlock, BACKLOG contingency met): -10% Materials consumed
    // per Hardware at Fabrication. Stacks multiplicatively with Fabrication's QA station
    // internal upgrade (core/economy.ts reads both — see fabricationConsumeMultiplier).
    // The Aluminum Hardware tier itself is still available from the start with no tech
    // required (Sprint 3's currentHardwareTier, unchanged) — this node's tier-gating and
    // Titanium-prerequisite role is unaffected by adding a real effect on top.
    effect: { target: 'fabrication.materialsPerHardware', op: 'mult', value: 0.9 },
  },
  {
    id: 'titanium',
    name: 'Titanium',
    branch: 'materials',
    costR: 400,
    durationMs: 3 * HOUR,
    deps: ['aluminum'],
    // Unlocks the Titanium Hardware tier — checked directly by id in
    // core/hardware.ts's currentHardwareTier, not a modifier.
  },
  // --- Propulsion ---
  {
    id: 'soundingRockets',
    name: 'Sounding rockets',
    branch: 'propulsion',
    costR: 20,
    durationMs: 4 * MIN,
    deps: [],
  },
  {
    id: 'probe1Engine',
    name: 'Probe-1 engine',
    branch: 'propulsion',
    costR: 40,
    durationMs: 10 * MIN,
    deps: ['soundingRockets'],
    // ECONOMY §5b v4.1 (Sprint 11.5): the clear first case for a building prerequisite —
    // certifying an engine-testing PROCEDURE for a facility you don't have was
    // thematically odd and mechanically frictionless. Test Stand built, not just
    // researched (its own unlock tech is a different Program-branch node entirely).
    buildingDep: 'testStand',
    secondaryCost: { materials: 50 }, // certification-adjacent: real test hardware
  },
  {
    id: 'orbital1Engine',
    name: 'Orbital-1 engine',
    branch: 'propulsion',
    costR: 500,
    durationMs: 4 * HOUR,
    deps: ['probe1Engine'],
    // No separate buildingDep: transitively requires Test Stand already, via probe1Engine.
    secondaryCost: { materials: 200 }, // certification-adjacent, higher tier than Probe-1
  },
  // --- Operations ---
  {
    id: 'basicLogistics',
    name: 'Basic logistics',
    branch: 'operations',
    costR: 60,
    durationMs: 15 * MIN,
    deps: [],
    effect: { target: 'transfer.duration', op: 'mult', value: 0.75 }, // -25%
  },
  {
    id: 'remoteOps',
    name: 'Remote Ops',
    branch: 'operations',
    costR: 120,
    durationMs: 45 * MIN,
    deps: ['basicLogistics'],
    effect: { target: 'offline.capMs', op: 'add', value: 6 * HOUR }, // 10h -> 16h
  },
  {
    id: 'vabQueues',
    name: 'VAB queues',
    branch: 'operations',
    costR: 350,
    durationMs: 2 * HOUR,
    deps: ['remoteOps'],
    // Auto-queue stages is a feature toggle, not a numeric modifier — whichever Sprint
    // 6+ system builds VAB queuing checks this id directly, same pattern as tiers/roles.
  },
  {
    id: 'autoRefuel',
    name: 'Auto-refuel',
    branch: 'operations',
    costR: 600,
    durationMs: 5 * HOUR,
    deps: ['vabQueues'],
    // ECONOMY §5 v3.5: -50% propellant loading duration for satellite-class missions —
    // checked directly by id in core/auroraMission.ts's startNextAuroraStage, same
    // "feature toggle, not a numeric modifier" pattern as vabQueues above.
    secondaryCost: { materials: 150 }, // ECONOMY §5b v4.1: real plumbing/equipment, not just know-how
  },
  // --- Program ---
  {
    id: 'basicEngineering',
    name: 'Basic engineering',
    branch: 'program',
    // ECONOMY §5 v4.1 (Sprint 11.5): Engineer is now promotion-ONLY (GDD §2 v2.11) — this
    // node no longer unlocks direct hiring (there is no direct-hire path to unlock).
    // Repurposed as the Technician->Engineer promotion accelerator: -25% cost and
    // duration, applied in core/staff.ts's promotionCost/promotionDurationMs. Cost/
    // duration below are unchanged from v3.7 (still real pacing protection, just for the
    // promotion itself rather than for a hiring-unlock race).
    costR: 120,
    durationMs: 45 * MIN,
    deps: [],
    effect: { target: 'promotion.technicianToEngineer', op: 'mult', value: 0.75 },
  },
  {
    id: 'scientificMethod',
    name: 'Scientific method',
    branch: 'program',
    // ECONOMY §5 v4.1: same repurposing as basicEngineering above, one rung up the
    // ladder — Engineer->Scientist promotion accelerator, -25% cost and duration.
    costR: 80,
    durationMs: 20 * MIN,
    deps: ['basicEngineering'],
    effect: { target: 'promotion.engineerToScientist', op: 'mult', value: 0.75 },
  },
  {
    id: 'testStand',
    name: 'Test stand',
    branch: 'program',
    costR: 150,
    durationMs: 40 * MIN,
    deps: ['scientificMethod'],
    secondaryCost: { funding: 300 }, // ECONOMY §5b v4.1: building-unlocking node (Testing complex)
  },
  {
    id: 'flightOperations',
    name: 'Flight operations',
    branch: 'program',
    costR: 250,
    durationMs: HOUR,
    deps: ['testStand'],
  },
  {
    id: 'flightProgram',
    name: 'Flight program',
    branch: 'program',
    costR: 400,
    durationMs: 2 * HOUR,
    deps: ['flightOperations'],
    secondaryCost: { funding: 500 }, // ECONOMY §5b v4.1: building-unlocking node (Launch complex)
  },
  {
    id: 'orbitalFlight',
    name: 'Orbital flight',
    branch: 'program',
    // ECONOMY §5b/§5c v4.1 (Sprint 11.5 income-rebalance): raised 700 -> 1,000 — the
    // program's capstone research gate, the single node the "3 Scientists out-produce
    // the entire remaining tree" finding most concretely names (the longest node, 6h).
    // Deliberately the ONLY costR raise in this pass: fresh sim data (tasks 3/4/6) found
    // the OPPOSITE problem at the START of the tree (basicEngineering stalls 12+h in
    // every seed) — raising early/mid costs or lowering R&D Lab's rate would have
    // directly worsened an already-confirmed regression. This targets the late-tree
    // abundance finding without touching the early bottleneck.
    costR: 1000,
    durationMs: 6 * HOUR,
    deps: ['flightProgram'],
  },
];

export const RESEARCH_BY_ID: Map<string, ResearchNode> = new Map(
  RESEARCH_TREE.map((n) => [n.id, n]),
);

/** Builds the registered Modifier for a completed node's declarative effect, or null
 * for effect-less nodes (most of them). `source` is the node id (CLAUDE.md's Modifier
 * schema: source identifies where a bonus came from, for future removal/inspection). */
export function modifierForNode(node: ResearchNode): Modifier | null {
  if (!node.effect) return null;
  return { id: `research:${node.id}`, source: node.id, ...node.effect };
}
