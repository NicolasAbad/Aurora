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
  // ECONOMY §5c v4.3 (Sprint 11.6): mutually-exclusive fork — symmetric by construction
  // (each side lists the other's id). Once EITHER side is completed, core/research.ts's
  // isNodeAvailable permanently excludes the other for that save — a real, irreversible
  // playstyle choice, not just a sequencing preference.
  excludes?: string[];
  // ECONOMY §5c v4.3: a genuine repeatable end-node (principle 5) — never enters
  // `research.completed`; its own `research.repeatablePurchases[id]` count is its
  // completion state, so it's always available again once its deps are met. Cost scales
  // by `costGrowthFactor` per prior purchase (core/actions.ts's startResearch); `effect`
  // (if present) registers a NEW modifier per purchase (unique id, so they stack via
  // applyModifiers' reduce — see core/research.ts's resolveResearch) rather than the
  // single fixed-id modifier a normal node's `modifierForNode` registers once.
  repeatable?: { costGrowthFactor: number; maxPurchases?: number };
  // UI_SPEC §5c principle 6 / Sprint 11.6 task 3: visual-hierarchy classification for
  // the redesigned tree's lane layout (screen 3) — a fork/repeatable/mechanic-changing
  // node renders larger/more distinct than a plain percentage node. Independent of
  // `excludes`/`repeatable`/`effect` existing (kept as its own explicit flag rather than
  // inferred, since inference would be fragile — e.g. a gate-only node also has no
  // `effect` but isn't "mechanic-changing"). Undefined = plain node, default size.
  visualWeight?: 'fork' | 'repeatable' | 'mechanic';
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
  // ECONOMY §5c v4.3 (Sprint 11.6): everything below this line through the end of the
  // Program branch is the tree-redesign & expansion pass — see that section for the
  // binding principles (real expansion, one fork per branch, 2 mechanic-changing nodes
  // per branch, cross-branch prerequisites, a repeatable end-node per branch). Every
  // node ABOVE this line is untouched, pre-existing content (rule 5b: shipped, tested
  // behavior).
  {
    id: 'consumptionCalibration',
    name: 'Consumption calibration',
    branch: 'materials',
    costR: 90,
    durationMs: 25 * MIN,
    deps: ['aluminum'],
    // Stacks multiplicatively with aluminum's own -10% and Fabrication's QA station
    // upgrade — same "linear per-source, applied one at a time" composition every other
    // materialsPerHardware source already uses.
    effect: { target: 'fabrication.materialsPerHardware', op: 'mult', value: 0.92 }, // further -8%
  },
  {
    id: 'refineryPriorityProtocols',
    name: 'Refinery priority protocols',
    branch: 'materials',
    costR: 180,
    durationMs: 45 * MIN,
    deps: ['aluminum'],
    // Mechanic-changing, not a modifier: flips ECONOMY §4b's fixed Fabrication-then-
    // Refinery claim order specifically for this save — checked by id in
    // core/economy.ts's resolveEconomyTick. A real, felt change to which of the two
    // starves first when Materials falls short, not a percentage.
    visualWeight: 'mechanic',
  },
  {
    id: 'leanFabrication',
    name: 'Lean fabrication',
    branch: 'materials',
    costR: 400,
    durationMs: 90 * MIN,
    // Cross-branch prerequisite (ECONOMY §5c principle 4): higher-throughput fabrication
    // doctrine leans on Propulsion's own test-stand efficiency work first.
    deps: ['titanium', 'ignitionSequencing'],
    excludes: ['volumeFabrication'],
    effect: { target: 'fabrication.materialsPerHardware', op: 'mult', value: 0.85 }, // further -15%, pure efficiency
    visualWeight: 'fork',
  },
  {
    id: 'volumeFabrication',
    name: 'Volume fabrication',
    branch: 'materials',
    costR: 400,
    durationMs: 90 * MIN,
    deps: ['titanium', 'ignitionSequencing'],
    excludes: ['leanFabrication'],
    // Mechanic-changing: a NEW `fabrication.rate` target (core/economy.ts) scales desired
    // OUTPUT itself (+25%) — genuinely different from the modifier system's existing
    // per-unit consumption knob every other Materials node uses. Its own +15%
    // consumption cost is a SECOND number a single `effect` field can't also carry — that
    // half is checked directly by this node's id in resolveEconomyTick, same "checked by
    // id, not a registered modifier" shape refineryPriorityProtocols above already uses.
    effect: { target: 'fabrication.rate', op: 'mult', value: 1.25 },
    visualWeight: 'fork',
  },
  {
    id: 'appliedMaterialsScience',
    name: 'Applied materials science',
    branch: 'materials',
    costR: 500,
    durationMs: HOUR,
    deps: ['consumptionCalibration'],
    // Repeatable end-node (ECONOMY §5c principle 5): a genuine Research sink — always
    // purchasable again once its one dependency is met, cost escalating ×1.8 per prior
    // purchase, each purchase stacking another -2% Materials/Hardware (registered as its
    // own modifier id — see modifierForRepeatablePurchase).
    effect: { target: 'fabrication.materialsPerHardware', op: 'mult', value: 0.98 },
    repeatable: { costGrowthFactor: 1.8 },
    visualWeight: 'repeatable',
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
  {
    id: 'ignitionSequencing',
    name: 'Ignition sequencing',
    branch: 'propulsion',
    costR: 150,
    durationMs: 40 * MIN,
    deps: ['probe1Engine'],
    // Stacks multiplicatively with the Instrumentation upgrade and Test Stand's own
    // per-level -3% (core/economy.ts's certificationDurationMultiplier already applies
    // both) — same composition pattern as Materials' consumption stack.
    effect: { target: 'certification.duration', op: 'mult', value: 0.9 },
  },
  {
    id: 'propellantChemistry',
    name: 'Propellant chemistry',
    branch: 'propulsion',
    costR: 200,
    durationMs: HOUR,
    deps: ['probe1Engine'],
    // Stacks with the Propulsion XP tree's own Efficient mixtures (-10% Propellant) —
    // same currency (Propellant per launch), different source, additive stacking via
    // applyModifiers' reduce like every other multi-source target.
    effect: { target: 'launch.propellant', op: 'mult', value: 0.92 },
  },
  {
    id: 'aggressiveFuelMixture',
    name: 'Aggressive fuel mixture',
    branch: 'propulsion',
    costR: 600,
    durationMs: 150 * MIN,
    deps: ['orbital1Engine'],
    excludes: ['safetyMarginMixture'],
    // Mechanic-changing: cheaper Propellant on EVERY launch, but a genuinely worse
    // outcome when a launch fails — checked by id in data/launch.ts's
    // hardwareRecoveryRate (45% recovered instead of the standard 60%), read by every
    // mission-failure resolution (sondas, Aurora, contracts) identically. BACKLOG's
    // original sketch also proposed a raised Confidence ceiling; simplified to these two
    // concrete levers (Propellant cost + failure severity) to keep the pair
    // implementable without touching core/confidence.ts's carefully-balanced "100%
    // always reachable" guarantee — flagged transparently, not silently dropped.
    effect: { target: 'launch.propellant', op: 'mult', value: 0.85 },
    visualWeight: 'fork',
  },
  {
    id: 'safetyMarginMixture',
    name: 'Safety-margin mixture',
    branch: 'propulsion',
    costR: 600,
    durationMs: 150 * MIN,
    deps: ['orbital1Engine'],
    excludes: ['aggressiveFuelMixture'],
    // Mirror of aggressiveFuelMixture: costlier Propellant, gentler failures (75%
    // Hardware recovered instead of 60%) — same hardwareRecoveryRate helper.
    effect: { target: 'launch.propellant', op: 'mult', value: 1.1 },
    visualWeight: 'fork',
  },
  {
    id: 'advancedPropulsionResearch',
    name: 'Advanced propulsion research',
    branch: 'propulsion',
    costR: 700,
    durationMs: 90 * MIN,
    deps: ['propellantChemistry'],
    // Repeatable end-node: each purchase stacks another -3% Propellant per launch.
    effect: { target: 'launch.propellant', op: 'mult', value: 0.97 },
    repeatable: { costGrowthFactor: 1.8 },
    visualWeight: 'repeatable',
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
  {
    id: 'logisticsAutomationII',
    name: 'Logistics automation II',
    branch: 'operations',
    costR: 250,
    durationMs: HOUR,
    deps: ['basicLogistics'],
    // Further -20% pad transfer, stacking with Basic logistics' own -25%.
    effect: { target: 'transfer.duration', op: 'mult', value: 0.8 },
  },
  {
    id: 'roundTheClockAutomation',
    name: 'Round-the-clock automation',
    branch: 'operations',
    costR: 550,
    durationMs: 2 * HOUR,
    // Cross-branch prerequisite: automating a facility to run well unsupervised leans on
    // Materials' own consumption-calibration work first (waste while unwatched is the
    // real risk this doctrine is meant to solve).
    deps: ['autoRefuel', 'consumptionCalibration'],
    excludes: ['handsOnOperations'],
    // Mechanic-changing: a NEW `offline.rateMult` target, checked in
    // core/offlineResolution.ts, boosts the effective rate resources/salaries accrue at
    // WHILE AWAY specifically (60% -> ~69%) — its excluded sibling instead speeds up
    // process.duration, which matters identically online or offline; this is the one
    // node in the whole redesign scoped to the offline-resolution path alone.
    effect: { target: 'offline.rateMult', op: 'mult', value: 1.15 },
    visualWeight: 'fork',
  },
  {
    id: 'handsOnOperations',
    name: 'Hands-on operations',
    branch: 'operations',
    costR: 550,
    durationMs: 2 * HOUR,
    deps: ['autoRefuel', 'consumptionCalibration'],
    excludes: ['roundTheClockAutomation'],
    // Already-wired target (E-05's own temporary effect uses the same one) — every
    // process (research, certification, integration, transfer, training, weather) -15%
    // duration, online or offline alike.
    effect: { target: 'process.duration', op: 'mult', value: 0.85 },
    visualWeight: 'fork',
  },
  {
    id: 'operationalExcellence',
    name: 'Operational excellence',
    branch: 'operations',
    costR: 800,
    durationMs: 2 * HOUR,
    deps: ['logisticsAutomationII'],
    // Repeatable end-node: each purchase stacks another -3% on every process's duration.
    effect: { target: 'process.duration', op: 'mult', value: 0.97 },
    repeatable: { costGrowthFactor: 1.9 },
    visualWeight: 'repeatable',
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
    id: 'moveFast',
    name: 'Move fast',
    branch: 'program',
    costR: 550,
    durationMs: 2 * HOUR,
    // Cross-branch prerequisite: a fast-moving institutional culture is proven out by
    // fast propulsion R&D first, not just declared.
    deps: ['flightOperations', 'propellantChemistry'],
    excludes: ['publicTrust'],
    // Mechanic-changing: a NEW, MORE GENERAL `promotion.allRates` target (core/staff.ts)
    // stacks on top of basicEngineering/scientificMethod's existing PER-STEP promotion
    // accelerators — a genuinely faster staff pipeline overall, not a bigger single-step
    // percentage.
    effect: { target: 'promotion.allRates', op: 'mult', value: 0.85 },
    visualWeight: 'fork',
  },
  {
    id: 'publicTrust',
    name: 'Public trust',
    branch: 'program',
    costR: 550,
    durationMs: 2 * HOUR,
    deps: ['flightOperations', 'propellantChemistry'],
    excludes: ['moveFast'],
    // Stacks with the Prestige XP tree's own Public relations node (+20% Reputation) —
    // same currency, different source.
    effect: { target: 'reputation.gain', op: 'mult', value: 1.15 },
    visualWeight: 'fork',
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
  {
    id: 'institutionalKnowledge',
    name: 'Institutional knowledge',
    branch: 'program',
    costR: 900,
    durationMs: 150 * MIN,
    deps: ['orbitalFlight'],
    // Repeatable end-node: each purchase stacks another +3% contract pay — deliberately
    // NOT a hiring-cost/salary target (every OTHER lever in this branch touches
    // headcount economics, which Sprint 11.7's own retune is working to bring back
    // in-band; this sink stays orthogonal to that work on purpose) and directly
    // reinforces Sprint 11.7's separate "contract pay is 0.22% of income" finding — one
    // node addressing two flagged problems (Research abundance + contract irrelevance)
    // at once.
    effect: { target: 'contract.pay', op: 'mult', value: 1.03 },
    repeatable: { costGrowthFactor: 1.9 },
    visualWeight: 'repeatable',
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

/** Sprint 11.6 (ECONOMY §5c principle 5): a repeatable node's Nth purchase gets its own
 * modifier id (`research:${id}:${purchaseNumber}`), unlike modifierForNode's single fixed
 * id — registerModifier dedupes by id, so each purchase's distinct id is what makes them
 * STACK via applyModifiers' reduce instead of the 2nd+ purchase being silently dropped as
 * "already registered." `purchaseNumber` is 1-indexed (the Nth purchase, not the count
 * after it) purely for a readable id; the modifier's effect is identical every purchase
 * (repeatable nodes escalate COST, not per-purchase effect size — see ResearchNode's own
 * `repeatable` field doc). */
export function modifierForRepeatablePurchase(node: ResearchNode, purchaseNumber: number): Modifier | null {
  if (!node.effect) return null;
  return { id: `research:${node.id}:${purchaseNumber}`, source: node.id, ...node.effect };
}

/** Sprint 11.6: a repeatable node's cost at its next purchase — `costGrowthFactor^priorPurchases`
 * applied to both the Research cost and any secondaryCost, same escalation shape
 * `core/economy.ts`'s `costAtLevel` uses for buildings, kept separate since research
 * costs round differently (no `costFactor: null` one-time case to share with). */
export function repeatableNodeCost(
  node: ResearchNode,
  priorPurchases: number,
): { research: number } & Partial<Record<ResourceId, number>> {
  const growth = node.repeatable ? node.repeatable.costGrowthFactor ** priorPurchases : 1;
  const secondary = Object.fromEntries(
    Object.entries(node.secondaryCost ?? {}).map(([id, amount]) => [id, Math.round(amount * growth)]),
  );
  return { research: Math.round(node.costR * growth), ...secondary };
}
