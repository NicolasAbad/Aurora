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
  // Node-card blurb (same "plain data field" pattern as InternalUpgradeDef.description,
  // not narrative-ID-routed). Only present where directly verified against real
  // code/data (a modifier, a ROLES.unlockTech match, or a BuildingDef.unlockCondition
  // match) — deliberately omitted for nodes whose gameplay effect isn't wired into
  // anything yet (soundingRockets/probe1Engine/orbital1Engine/vabQueues/autoRefuel/
  // orbitalFlight), rather than invent a plausible-sounding claim.
  description?: string;
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
    // v2.9: explicitly NO production effect — the Aluminum Hardware tier is available
    // from the start with no tech required (ratified Sprint 3's currentHardwareTier).
    // This node's only functions: Titanium's prerequisite, and the Materials branch's
    // entry node (without it the branch would show a single unreachable 400 R node for
    // the whole first era — UI_SPEC §2b's progressive disclosure would hide it entirely).
    description: 'Certifying aluminum stock for flight hardware.', // flavor only, per owner instruction — must not promise a benefit
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
    description: 'Unlocks the Titanium Hardware tier.',
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
    description: '-25% transfer time.',
  },
  {
    id: 'remoteOps',
    name: 'Remote Ops',
    branch: 'operations',
    costR: 120,
    durationMs: 45 * MIN,
    deps: ['basicLogistics'],
    effect: { target: 'offline.capMs', op: 'add', value: 6 * HOUR }, // 10h -> 16h
    description: 'Offline progress cap: 10h -> 16h.',
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
  },
  // --- Program ---
  {
    id: 'basicEngineering',
    name: 'Basic engineering',
    branch: 'program',
    costR: 15,
    durationMs: 3 * MIN,
    deps: [],
    description: 'Unlocks hiring Engineers.', // verified: ROLES.engineer.unlockTech === 'basicEngineering'
  },
  {
    id: 'scientificMethod',
    name: 'Scientific method',
    branch: 'program',
    costR: 80,
    durationMs: 20 * MIN,
    deps: ['basicEngineering'],
    description: 'Unlocks hiring Scientists.', // verified: ROLES.scientist.unlockTech === 'scientificMethod'
  },
  {
    id: 'testStand',
    name: 'Test stand',
    branch: 'program',
    costR: 150,
    durationMs: 40 * MIN,
    deps: ['scientificMethod'],
    description: 'Unlocks the Engine Test Stand and Launch Rail.', // verified: both buildings' unlockCondition
  },
  {
    id: 'flightOperations',
    name: 'Flight operations',
    branch: 'program',
    costR: 250,
    durationMs: HOUR,
    deps: ['testStand'],
    description: 'Unlocks hiring Controllers.', // verified: ROLES.controller.unlockTech === 'flightOperations'
  },
  {
    id: 'flightProgram',
    name: 'Flight program',
    branch: 'program',
    costR: 400,
    durationMs: 2 * HOUR,
    deps: ['flightOperations'],
    description: 'Unlocks Complex D — Launch.', // verified: VAB/Launch Pad/Launch Control/Tracking Station unlockCondition
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
