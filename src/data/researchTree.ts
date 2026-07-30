// ECONOMY_MODEL.md §5 (v2.9). Node ids match sim/run.ts's pre-existing RESEARCH array
// (built ahead of this sprint) exactly, so both stay in sync — see sim/run.ts's import.
import type { Modifier } from '../core/types';

const MIN = 60_000;
const HOUR = 60 * MIN;

export interface ResearchNode {
  id: string;
  name: string;
  branch: 'materials' | 'propulsion' | 'operations' | 'program';
  costR: number;
  durationMs: number;
  deps: string[];
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
  },
  {
    id: 'orbital1Engine',
    name: 'Orbital-1 engine',
    branch: 'propulsion',
    costR: 500,
    durationMs: 4 * HOUR,
    deps: ['probe1Engine'],
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
  },
  {
    id: 'orbitalFlight',
    name: 'Orbital flight',
    branch: 'program',
    costR: 700,
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
