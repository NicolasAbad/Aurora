// sim/run.ts — Sprint 0 headless balance simulator (SPRINTS.md Sprint 0, task 5).
// Dev-only: nothing under /src imports from /sim, so it never reaches the production
// bundle (CLAUDE.md rule 11 — env-gating is structural here, not a runtime flag).
//
// Runs TWO bot profiles against the real formulas in core/economy.ts and the real
// building data in data/buildings.ts, at accelerated time (1 simulated minute per
// step), and reports both — because a single always-on bot can't tell you whether the
// ECONOMY is paced right or the bot is just superhuman:
//   - "optimal": the original Sprint 0 bot — always on, re-evaluates spending every
//     15 simulated minutes around the clock. An upper bound, not a target.
//   - "human": 3 active sessions/day of ~20 min each (manual actions — pitch, Funding
//     Rounds, hiring, building, promotions — ONLY happen in a session); the rest of the
//     day resolves like the game's own offline rule (ECONOMY §11: resources AND
//     salaries at 60%, capped at 10h/16h-with-Remote-Ops; process TIMERS still run at
//     100% regardless — research, certification, sonda assembly, VAB stages, contracts).
//
// Emits a day-by-day CSV per profile (each row tagged with its era — preFlight/sonda/
// satellite, see classifyEra()) and checks the ECONOMY_MODEL.md sanity rules:
//   - salaries = 30-55% of passive Funding income, sampled at 5 arc checkpoints
//   - Flight Data = 20-35% of Research income, checked separately for the sonda and
//     satellite eras (ECONOMY §8 v2.3 — pre-flight is reported too but has no target,
//     it's lab-only by construction)
//   - pacing floor (ECONOMY §8 v2.3, codified after the day-5 human result was
//     accepted): the "human" profile must not reach Aurora I before simulated day 5.
//     Always reported (PASS/FAIL) in printSummary(); a loud FLAG line in main() on
//     failure. "human" is an efficient lower bound (no FTUE friction, no mistakes, no
//     launch failures) — real players will be slower; revisit with real testers at
//     Sprint 8, not before.
// plus days-to-Aurora-I for both profiles (docs/PROGRESS.md carries the comparison).
//
// Certification and Aurora I values aren't owned by any core/ or data/ module yet (those
// land in Sprint 7) so they're transcribed here directly from ECONOMY_MODEL §6-§7.
// Sounding-rocket, tier-0 contract and Program Record values (Sprint 6) now import their
// real counterparts from src/data/soundingRockets.ts, src/data/contracts.ts and
// src/core/records.ts instead of keeping a second hardcoded copy here — see the S1_*/
// S2_*/TIER0_*/RECORDS definitions below. When Sprint 7 builds real data files for
// certification/Aurora I, point this simulator at them too.
//
// Simplifications the bot makes that a real player wouldn't have to (documented instead
// of silently guessed away — see docs/PROGRESS.md "Sprint 0 findings" for the doc gaps
// these plug):
//   - Hardware is tracked as one flat pool (tier bookkeeping is a Sprint 3 concern; tier
//     never gates anything this bot does within a Sprint-0-scale run).
//   - The bot always buys Probe-1 and Orbital-1 EXTENDED certification once available.
//     Both are guaranteed-success per GDD §7b, so every S-1/S-2/Aurora-I flight the bot
//     takes resolves deterministically at 100% Confidence — the only roll left is
//     Orbital-1's intrinsic 80% BASE certification (ECONOMY §6), which is simulated.
//   - ECONOMY_MODEL §7 lists no duration for the "Satellite payload" and "Flight review"
//     Aurora I stages. Resolved in v2.2: 15 min and instant (0 min), respectively.
//   - "human" session timing (3 sessions/day at hours 7/14/21, 20 min each) is a sim-only
//     methodology choice, not sourced from any doc — a reasonable guess at real play
//     cadence, not a claim about intended pacing.
//   - ECONOMY §8's "Contract fulfilled" reward is explicit per tier as of v2.4
//     (CONTRACT_REWARDS below); the sim only models tier-0 (satellite tiers 1/2 need
//     Payload Processing + post-Aurora-I systems this sim doesn't build). This reward
//     was entirely missing from the sim before v2.3's reconciliation pass (tickContract
//     only paid Funding+Reputation) — added because it's load-bearing for the per-era
//     Flight-Data instrumentation. v2.3's stopgap picked the low end of what was then an
//     ambiguous range for tier-0; v2.4 made that number explicit instead (it happened to
//     match, but the code no longer rests on that interpretation).
//   - Per instruction: this reconciliation pass does NOT change any ECONOMY_MODEL value.
//     If the numbers look off, that's the finding to report, not something to quietly fix
//     here — see docs/PROGRESS.md's decision-rule note.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORBITAL1_FAILURE_FLIGHT_XP,
  SCRIPTED_FAILURE_REWARD as CERT_SCRIPTED_FAILURE_REWARD,
  STATIC_FIRE_SUCCESS_REWARD as CERT_STATIC_FIRE_SUCCESS_REWARD,
} from '../src/core/certification';
import { costAtLevel, pitchYield, productionPerSecond } from '../src/core/economy';
import { RECORD_DEFS } from '../src/core/records';
import { AURORA_I_REWARD, AURORA_I_STAGES as REAL_AURORA_I_STAGES } from '../src/data/auroraI';
import { BUILDINGS } from '../src/data/buildings';
import { CERTIFICATION_TESTS_BY_ID } from '../src/data/certifications';
import { CONTRACT_TIERS, TIER0_PAYLOAD_EXTRA_HARDWARE, TIER0_PAYLOAD_EXTRA_PROPELLANT } from '../src/data/contracts';
import { RESEARCH_TREE, type ResearchNode } from '../src/data/researchTree';
import { SOUNDING_ROCKETS, WEATHER_WINDOW_MAX_MS, WEATHER_WINDOW_MIN_MS } from '../src/data/soundingRockets';
import type { BuildingId, ResourceId, RoleId, UnlockCondition } from '../src/core/types';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const DAYS = Number(args.days ?? 30);
const SEED = Number(args.seed ?? 42);

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — reproducible runs; only the Orbital-1 80% base
// certification roll uses this (ECONOMY §6). Reset per profile run (see
// runSimulation()) so both profiles face the same random sequence for fair comparison.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(SEED);

// ---------------------------------------------------------------------------
// Data tables transcribed from ECONOMY_MODEL.md (see file header note above)
// ---------------------------------------------------------------------------
const ROLES: Record<RoleId, { baseCost: number; salaryPerSec: number; unlockTech: string | null }> = {
  technician: { baseCost: 50, salaryPerSec: 0.15, unlockTech: null },
  engineer: { baseCost: 150, salaryPerSec: 0.35, unlockTech: 'basicEngineering' },
  scientist: { baseCost: 400, salaryPerSec: 0.6, unlockTech: 'scientificMethod' },
  controller: { baseCost: 250, salaryPerSec: 0.35, unlockTech: 'flightOperations' },
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY_MS = 24 * HOUR;
// Sprint 4: was this file's own hardcoded copy (built ahead of data/researchTree.ts
// existing); now imports the real tree so the two can't drift. Extra fields the real
// tree carries (name/branch/effect/description) are simply unused here.
const RESEARCH = RESEARCH_TREE;
const RESEARCH_BY_ID = new Map(RESEARCH.map((n) => [n.id, n]));
const RESEARCH_PRIORITY = [
  'basicEngineering',
  'scientificMethod',
  'testStand',
  'soundingRockets',
  'probe1Engine',
  'flightOperations',
  'flightProgram',
  'aluminum',
  'orbital1Engine',
  'orbitalFlight',
  'basicLogistics',
  'remoteOps',
  'titanium',
  'vabQueues',
  'autoRefuel',
];

// Buildings the bot actively invests in, in priority order (cheapest-affordable-first
// within this order — see resolveConstruction). Offices/Training Center excluded: the
// bot doesn't manually pitch enough for Offices levels to matter, and Training Center
// is locked v1.
const BUILD_PRIORITY: BuildingId[] = [
  'finance',
  'crewQuarters',
  'rndLab',
  'supplyDepot',
  'fabrication',
  'refinery',
  'warehouse',
  'propellantDepot',
  'testStand',
  'launchRail',
  'payloadProcessing',
  'vab',
  'launchPad',
  'launchControl',
  'trackingStation',
  'launchPadB',
];

// Sprint 7: was this file's own hardcoded copy; now imports src/data/certifications.ts
// and src/core/certification.ts's exported reward constants (same pattern as Sprint 4's
// RESEARCH_TREE / Sprint 6's SOUNDING_ROCKETS imports).
const CERT_PROBE1_TEST1 = CERTIFICATION_TESTS_BY_ID.get('probe1Test1')!.consumes;
const CERT_PROBE1_TEST2 = CERTIFICATION_TESTS_BY_ID.get('probe1Test2')!.consumes;
const CERT_PROBE1_EXT = CERTIFICATION_TESTS_BY_ID.get('probe1Extended')!.consumes;
const CERT_ORBITAL1_BASE = CERTIFICATION_TESTS_BY_ID.get('orbital1Base')!.consumes;
const CERT_ORBITAL1_EXT = CERTIFICATION_TESTS_BY_ID.get('orbital1Extended')!.consumes;
const CERT_DURATION = CERTIFICATION_TESTS_BY_ID.get('probe1Test1')!.durationMs; // same for all 3 Probe-1 tests
const ORBITAL1_BASE_DURATION = CERTIFICATION_TESTS_BY_ID.get('orbital1Base')!.durationMs;
const ORBITAL1_RETRY_DURATION = CERTIFICATION_TESTS_BY_ID.get('orbital1Retry')!.durationMs;
const ORBITAL1_EXT_DURATION = CERTIFICATION_TESTS_BY_ID.get('orbital1Extended')!.durationMs;
const ORBITAL1_SUCCESS_RATE = CERTIFICATION_TESTS_BY_ID.get('orbital1Base')!.successRate!;
const STATIC_FIRE_SUCCESS_REWARD = {
  flightxp: CERT_STATIC_FIRE_SUCCESS_REWARD.flightxp,
  reputation: CERT_STATIC_FIRE_SUCCESS_REWARD.reputation,
  researchFlightData: CERT_STATIC_FIRE_SUCCESS_REWARD.flightData,
};
const SCRIPTED_FAILURE_REWARD = {
  flightxp: CERT_SCRIPTED_FAILURE_REWARD.flightxp,
  researchFlightData: CERT_SCRIPTED_FAILURE_REWARD.flightData,
};

// Sprint 6: was this file's own hardcoded copy; now imports src/data/soundingRockets.ts
// so the two can't drift (same pattern as Sprint 4's RESEARCH_TREE import above).
const S1_ASSEMBLY = { hardware: SOUNDING_ROCKETS.s1.assemblyHardware, durationMs: SOUNDING_ROCKETS.s1.assemblyDurationMs };
const S1_LAUNCH_PROPELLANT = SOUNDING_ROCKETS.s1.launchPropellant;
const S1_WEATHER_MS = (WEATHER_WINDOW_MIN_MS + WEATHER_WINDOW_MAX_MS) / 2; // ECONOMY §11: uniform 2-5 min; using the midpoint
const S1_REWARD = {
  flightxp: SOUNDING_ROCKETS.s1.successReward.flightxp,
  researchFlightData: SOUNDING_ROCKETS.s1.successReward.flightData,
  reputation: SOUNDING_ROCKETS.s1.successReward.reputation,
};

const S2_ASSEMBLY = { hardware: SOUNDING_ROCKETS.s2.assemblyHardware, durationMs: SOUNDING_ROCKETS.s2.assemblyDurationMs };
const S2_LAUNCH_PROPELLANT = SOUNDING_ROCKETS.s2.launchPropellant;
const S2_FLIGHT_REVIEW_R = SOUNDING_ROCKETS.s2.flightReviewCostResearch!;
const S2_REWARD = {
  flightxp: SOUNDING_ROCKETS.s2.successReward.flightxp,
  researchFlightData: SOUNDING_ROCKETS.s2.successReward.flightData,
  reputation: SOUNDING_ROCKETS.s2.successReward.reputation,
};

// ECONOMY §10: all-inclusive = the standard S-1 (assembly + launch) + client payload
// integration (src/data/contracts.ts's TIER0_PAYLOAD_EXTRA_*).
const TIER0_CONTRACT_COST = {
  hardware: SOUNDING_ROCKETS.s1.assemblyHardware + TIER0_PAYLOAD_EXTRA_HARDWARE,
  propellant: SOUNDING_ROCKETS.s1.launchPropellant + TIER0_PAYLOAD_EXTRA_PROPELLANT,
};
// Sim-only approximation, not owned by any real data file (the real game runs a
// contract-linked flight through the actual sonda checklist/confidence/roll — this sim
// deliberately doesn't model that, see the header note's guaranteed-success simplification).
const TIER0_CONTRACT_BUILD_MS = 12 * MIN; // approximated: same order as an S-1 assembly
const TIER0_CONTRACT_ROTATION_MS = CONTRACT_TIERS[0].offerRotationMs;
// Contract rewards per tier: src/data/contracts.ts's CONTRACT_TIERS (ECONOMY §8's
// "Contract fulfilled" row, ON TOP of the underlying flight's own reward). The sim only
// models tier-0 (satellite tiers 1/2 need Payload Processing + post-Aurora-I systems this
// sim doesn't build); tiers 1/2 are here for when that's implemented.
const CONTRACT_REWARDS = {
  0: {
    funding: CONTRACT_TIERS[0].reward.funding,
    reputation: CONTRACT_TIERS[0].reward.reputation,
    flightxp: CONTRACT_TIERS[0].reward.flightxp,
    researchFlightData: CONTRACT_TIERS[0].reward.flightData,
  },
  1: {
    funding: CONTRACT_TIERS[1].reward.funding,
    reputation: CONTRACT_TIERS[1].reward.reputation,
    flightxp: CONTRACT_TIERS[1].reward.flightxp,
    researchFlightData: CONTRACT_TIERS[1].reward.flightData,
  },
  2: {
    funding: CONTRACT_TIERS[2].reward.funding,
    reputation: CONTRACT_TIERS[2].reward.reputation,
    flightxp: CONTRACT_TIERS[2].reward.flightxp,
    researchFlightData: CONTRACT_TIERS[2].reward.flightData,
  },
} as const;

const FUNDING_ROUND_I = { yieldAmount: 500, cooldownMs: 10 * MIN, reputationGate: 25 };
const FUNDING_ROUND_II = { yieldAmount: 2500, cooldownMs: 30 * MIN, reputationGate: 75 };

// Sprint 7: was this file's own hardcoded copy; now imports src/data/auroraI.ts.
const AURORA_I_STAGES = REAL_AURORA_I_STAGES;
const AURORA_I_SIM_REWARD = {
  flightxp: AURORA_I_REWARD.flightxp,
  researchFlightData: AURORA_I_REWARD.flightData,
  reputation: AURORA_I_REWARD.reputation,
};

// Sprint 6: now imports src/core/records.ts's RECORD_DEFS instead of a local copy.
const RECORDS = {
  firstIgnition: RECORD_DEFS.firstIgnition.reward,
  firstFlight: RECORD_DEFS.firstFlight.reward,
  pastKarman: RECORD_DEFS.pastKarman.reward,
  firstOrbit: RECORD_DEFS.firstOrbit.reward,
  firstCustomer: RECORD_DEFS.firstCustomer.reward,
  firstDelivery: RECORD_DEFS.firstDelivery.reward,
} as const;

// ---------------------------------------------------------------------------
// "Human" profile session schedule (sim-only methodology, see header note)
// ---------------------------------------------------------------------------
type Profile = 'optimal' | 'human';
const SESSION_START_HOURS = [7, 14, 21]; // 3 sessions/day, ~8h apart
const SESSION_DURATION_MS = 20 * MIN;
const OFFLINE_RATE = 0.6; // ECONOMY §11
const OFFLINE_CAP_MS_BASE = 10 * HOUR;
const OFFLINE_CAP_MS_EXTENDED = 16 * HOUR; // with Remote Ops tech

function isInSession(nowMs: number): boolean {
  const timeOfDayMs = nowMs % DAY_MS;
  return SESSION_START_HOURS.some((h) => {
    const start = h * HOUR;
    return timeOfDayMs >= start && timeOfDayMs < start + SESSION_DURATION_MS;
  });
}

// ---------------------------------------------------------------------------
// Simulation state (self-contained — not the shipped GameState; see header note)
// ---------------------------------------------------------------------------
interface Timer {
  remainingMs: number;
  onComplete: () => void;
}

interface SimState {
  nowMs: number;
  resources: Record<ResourceId, number>;
  lifetimeFunding: number;
  cap: Record<ResourceId, number>; // Infinity = uncapped
  buildingLevel: Record<BuildingId, number>;
  builtOnce: Set<BuildingId>; // for one-time buildings
  staffHired: Record<RoleId, number>;
  techCompleted: Set<string>;
  researchTimer: Timer | null;
  payrollUnpaid: boolean;

  // "human" profile only: ms elapsed since the last active session ended, for the
  // offline-cap rule (ECONOMY §11). Unused (stays 0) for "optimal".
  offlineElapsedMs: number;

  fundingRoundINextAt: number; // ms timestamp; 0 = available as soon as reputation-gated
  fundingRoundIINextAt: number;

  // Promotion (ECONOMY §3): the only bootstrap path to Engineer/Scientist before their
  // gating tech is researched — see resolvePromotions() for why this is load-bearing.
  classroomBuilt: boolean;
  promotionTimer: Timer | null;

  extendedRailBought: boolean;
  probe1Test1Done: boolean;
  probe1Test2Done: boolean; // certified
  probe1ExtendedDone: boolean;
  orbital1BaseDone: boolean;
  orbital1ExtendedDone: boolean;
  certTimer: (Timer & { kind: string }) | null;

  sondaTimer: (Timer & { kind: 's1' | 's2' }) | null;
  s1Flights: number;
  s2Flown: boolean; // sim-internal only: has the bot flown its one modeled S-2 (caps the sonda campaign at one S-2, unrelated to any unlock condition)
  s2FlownDay: number | null; // 1-based simulated day of the Kármán-line flight

  contractTimer: Timer | null;
  contractCooldownMs: number;
  contractsAccepted: number;
  contractsFulfilled: number;

  auroraStageIndex: number;
  auroraTimer: Timer | null;
  auroraILaunched: boolean;
  auroraILaunchedDay: number | null; // 1-based simulated day it happened on

  // Era boundary markers (ECONOMY §8 v2.3: Flight Data target is per-era). 1-based
  // simulated day, set once, first time either event happens — see grantFlightData()
  // and tickAurora(). Pre-flight era = before firstFlightDataDay; sonda era = from
  // firstFlightDataDay up to (not including) auroraILaunchedDay; satellite era = from
  // auroraILaunchedDay on.
  firstFlightDataDay: number | null;

  // Research-stall detection: how long the CURRENT next-eligible research node (deps
  // satisfied, not yet completed — see findNextResearchNode()) has been unaffordable
  // with no research in progress. `logged` prevents re-logging the same continuous
  // stall every tick once it crosses the 12h threshold. See updateResearchStallTracking().
  researchStallTracking: { nodeId: string; sinceMs: number; logged: boolean } | null;
  researchStalls: { nodeId: string; day: number }[];

  recordsAwarded: Set<keyof typeof RECORDS>;

  // Per-day accumulators, reset at each day boundary
  day: {
    fundingFromPitch: number;
    fundingFromFundingRounds: number;
    fundingFromPassive: number; // Finance
    fundingFromContracts: number;
    fundingFromRecords: number;
    fundingSpentOnPurchases: number;
    fundingSpentOnHires: number;
    salaryPaid: number;
    researchFromLab: number;
    researchFromFlightData: number;
    payrollUnpaidMs: number;
    notes: string[];
  };
}

function freshDayAccumulator(): SimState['day'] {
  return {
    fundingFromPitch: 0,
    fundingFromFundingRounds: 0,
    fundingFromPassive: 0,
    fundingFromContracts: 0,
    fundingFromRecords: 0,
    fundingSpentOnPurchases: 0,
    fundingSpentOnHires: 0,
    salaryPaid: 0,
    researchFromLab: 0,
    researchFromFlightData: 0,
    payrollUnpaidMs: 0,
    notes: [],
  };
}

function createState(): SimState {
  const buildingLevel = Object.fromEntries(
    (Object.keys(BUILDINGS) as BuildingId[]).map((id) => [id, id === 'offices' ? 1 : 0]),
  ) as Record<BuildingId, number>;

  return {
    nowMs: 0,
    resources: {
      funding: 0,
      research: 0,
      materials: 0,
      hardware: 0,
      propellant: 0,
      reputation: 0,
      flightxp: 0,
    },
    lifetimeFunding: 0,
    cap: {
      funding: 500,
      materials: 200,
      hardware: 50,
      propellant: 0,
      research: Infinity,
      reputation: Infinity,
      flightxp: Infinity,
    },
    buildingLevel,
    builtOnce: new Set(),
    staffHired: { technician: 0, engineer: 0, scientist: 0, controller: 0 },
    techCompleted: new Set(),
    researchTimer: null,
    payrollUnpaid: false,
    offlineElapsedMs: 0,
    fundingRoundINextAt: 0,
    fundingRoundIINextAt: 0,
    classroomBuilt: false,
    promotionTimer: null,
    extendedRailBought: false,
    probe1Test1Done: false,
    probe1Test2Done: false,
    probe1ExtendedDone: false,
    orbital1BaseDone: false,
    orbital1ExtendedDone: false,
    certTimer: null,
    sondaTimer: null,
    s1Flights: 0,
    s2Flown: false,
    s2FlownDay: null,
    contractTimer: null,
    contractCooldownMs: 0,
    contractsAccepted: 0,
    contractsFulfilled: 0,
    auroraStageIndex: 0,
    auroraTimer: null,
    auroraILaunched: false,
    auroraILaunchedDay: null,
    firstFlightDataDay: null,
    researchStallTracking: null,
    researchStalls: [],
    recordsAwarded: new Set(),
    day: freshDayAccumulator(),
  };
}

// ---------------------------------------------------------------------------
// Resource helpers
// ---------------------------------------------------------------------------
function canAfford(state: SimState, cost: Partial<Record<ResourceId, number>>): boolean {
  return Object.entries(cost).every(([id, amount]) => state.resources[id as ResourceId] >= amount!);
}

function pay(state: SimState, cost: Partial<Record<ResourceId, number>>): void {
  for (const [id, amount] of Object.entries(cost)) {
    state.resources[id as ResourceId] -= amount!;
  }
}

function grant(state: SimState, id: ResourceId, amount: number, oneTime: boolean): void {
  if (amount <= 0) return;
  const cap = state.cap[id];
  if (oneTime) {
    state.resources[id] += amount;
  } else {
    const room = cap === Infinity ? amount : Math.max(0, cap - state.resources[id]);
    state.resources[id] += Math.min(amount, room);
  }
  if (id === 'funding') state.lifetimeFunding += amount;
}

// Flight Data is Research income from a mission/test (ECONOMY §8), always a one-time
// grant. Centralized here (rather than each call site doing `grant()` + accumulator +
// era-marker separately) so the era boundary can't be forgotten at a new call site.
function grantFlightData(state: SimState, amount: number): void {
  grant(state, 'research', amount, true);
  state.day.researchFromFlightData += amount;
  if (state.firstFlightDataDay === null) {
    state.firstFlightDataDay = Math.floor(state.nowMs / DAY_MS) + 1;
  }
}

function isUnlocked(state: SimState, cond: UnlockCondition): boolean {
  switch (cond.kind) {
    case 'start':
      return true;
    case 'lifetimeFunding':
      return state.lifetimeFunding >= cond.amount;
    case 'tech':
      return state.techCompleted.has(cond.id);
    case 'reputation':
      return state.resources.reputation >= cond.amount;
    case 'auroraISuccess':
      return state.auroraILaunched;
    case 'buildingLevel':
      return state.buildingLevel[cond.building] >= cond.level;
    case 'all':
      return cond.conditions.every((c) => isUnlocked(state, c));
    case 'locked':
      return false;
  }
}

// ECONOMY §1 (v2.2): starting staff cap 2; Crew Quarters' staffCapBonus (+3/level, per
// data/buildings.ts) adds on top.
function staffCap(state: SimState): number {
  return 2 + (BUILDINGS.crewQuarters.staffCapBonus ?? 0) * state.buildingLevel.crewQuarters;
}

function totalHired(state: SimState): number {
  return Object.values(state.staffHired).reduce((a, b) => a + b, 0);
}

function requiredSlots(state: SimState, role: RoleId): number {
  let total = 0;
  for (const def of Object.values(BUILDINGS)) {
    if (!def.slots?.[role]) continue;
    if (state.buildingLevel[def.id] > 0) total += def.slots[role]!;
  }
  return total;
}

function passiveFundingRate(state: SimState): number {
  const def = BUILDINGS.finance;
  const level = state.buildingLevel.finance;
  const required = def.slots!.technician!;
  const assigned = Math.min(state.staffHired.technician, required);
  return productionPerSecond(def.production!.basePerSec, level, assigned / required || 0);
}

// ---------------------------------------------------------------------------
// Bot decisions — only invoked while "active" (see tick()): every check-in for
// "optimal", only during a session for "human".
// ---------------------------------------------------------------------------
function resolveHiring(state: SimState): void {
  // One hiring pass per check-in — up to one hire per role.
  for (let guard = 0; guard < 1; guard++) {
    let hired = false;
    for (const role of Object.keys(ROLES) as RoleId[]) {
      const def = ROLES[role];
      if (def.unlockTech && !state.techCompleted.has(def.unlockTech)) continue;
      if (totalHired(state) >= staffCap(state)) continue;
      if (state.staffHired[role] >= requiredSlots(state, role)) continue;

      const cost = def.baseCost * 1.15 ** state.staffHired[role];
      if (state.resources.funding < cost) continue;

      const currentSalary = Object.entries(state.staffHired).reduce(
        (sum, [r, n]) => sum + n * ROLES[r as RoleId].salaryPerSec,
        0,
      );
      const budget = 0.5 * Math.max(passiveFundingRate(state), 2);
      if (currentSalary + def.salaryPerSec > budget) continue;

      state.resources.funding -= cost;
      state.day.fundingSpentOnHires += cost;
      state.staffHired[role] += 1;
      hired = true;
    }
    if (!hired) break;
  }
}

// Promotion (ECONOMY §3) is the only route to Engineer/Scientist before their tech is
// researched — and Scientific method/Basic engineering tech can ONLY be researched via
// a Scientist-staffed R&D Lab. Without promotion, hiring is circularly deadlocked
// (Scientist needs tech -> tech needs Research -> Research needs a Scientist-staffed
// R&D Lab -> Scientist needs tech...). This isn't a simulator shortcut: it's the
// documented bootstrap path, just easy to miss since §3's "Unlock" column reads like it
// gates ALL acquisition rather than only direct hiring.
function resolvePromotions(state: SimState): void {
  if (state.promotionTimer || !state.classroomBuilt) return;
  if (requiredSlots(state, 'scientist') <= state.staffHired.scientist) return;

  if (state.staffHired.engineer > 0 && canAfford(state, { funding: 300 })) {
    pay(state, { funding: 300 });
    state.day.fundingSpentOnHires += 300;
    state.promotionTimer = {
      remainingMs: 45 * MIN,
      onComplete: () => {
        state.staffHired.engineer -= 1;
        state.staffHired.scientist += 1;
        state.day.notes.push('promoted Engineer -> Scientist');
      },
    };
    return;
  }

  // No spare Engineer yet: hire + promote a Technician toward Engineer first.
  const techHireCost = ROLES.technician.baseCost * 1.15 ** state.staffHired.technician;
  if (totalHired(state) >= staffCap(state)) return;
  if (!canAfford(state, { funding: techHireCost + 100 })) return;
  pay(state, { funding: techHireCost + 100 });
  state.day.fundingSpentOnHires += techHireCost + 100;
  state.staffHired.technician += 1;
  state.promotionTimer = {
    remainingMs: 15 * MIN,
    onComplete: () => {
      state.staffHired.technician -= 1;
      state.staffHired.engineer += 1;
      state.day.notes.push('promoted Technician -> Engineer');
    },
  };
}

function resolveConstruction(state: SimState): void {
  // One purchase per check-in — a real session buys one thing and moves on, rather
  // than instantly reinvesting every accumulated Funding.
  for (let guard = 0; guard < 1; guard++) {
    let bought = false;

    // Classroom unlocks promotion — buy it as soon as Crew Quarters exists, since the
    // Research bootstrap depends on it (see resolvePromotions).
    if (state.buildingLevel.crewQuarters > 0 && !state.classroomBuilt && canAfford(state, { funding: 400 })) {
      pay(state, { funding: 400 });
      state.day.fundingSpentOnPurchases += 400;
      state.classroomBuilt = true;
      bought = true;
    }

    // Staff-cap-constrained bottleneck: if every hired role is pinned at cap while a
    // built producer still has unfilled slots, Crew Quarters is the "useful" buy this
    // check-in regardless of its normal priority position.
    const staffBottlenecked =
      !bought &&
      totalHired(state) >= staffCap(state) &&
      (Object.keys(ROLES) as RoleId[]).some((r) => requiredSlots(state, r) > state.staffHired[r]);
    if (staffBottlenecked) {
      const cost = costAtLevel(
        BUILDINGS.crewQuarters.baseCost,
        BUILDINGS.crewQuarters.costFactor,
        state.buildingLevel.crewQuarters,
      );
      if (canAfford(state, cost)) {
        pay(state, cost);
        state.day.fundingSpentOnPurchases += cost.funding ?? 0;
        state.buildingLevel.crewQuarters += 1;
        bought = true;
      }
    }

    for (const id of BUILD_PRIORITY) {
      if (bought) break;
      const def = BUILDINGS[id];
      if (!isUnlocked(state, def.unlockCondition)) continue;
      if (def.costFactor === null && state.builtOnce.has(id)) continue; // one-time, done

      const level = state.buildingLevel[id];
      // Soft level cap on multi-level buildings: "cheapest affordable first" would
      // otherwise reinvest forever in whatever's already built (cost grows ~1.1-1.15x/
      // level, always cheaper than the next unbuilt item), and Funding never pools
      // toward big-ticket infrastructure like Test Stand (800F) or VAB (2000F). Capping
      // early re-investment lets priority genuinely advance down BUILD_PRIORITY.
      if (def.costFactor !== null && level >= 5) continue;

      const cost = costAtLevel(def.baseCost, def.costFactor, level);
      if (!canAfford(state, cost)) continue;

      pay(state, cost);
      state.day.fundingSpentOnPurchases += cost.funding ?? 0;
      if (def.costFactor === null) {
        state.builtOnce.add(id);
        state.buildingLevel[id] = 1;
      } else {
        state.buildingLevel[id] += 1;
      }
      state.cap.funding += def.capBonus?.funding ?? 0;
      state.cap.materials += def.capBonus?.materials ?? 0;
      state.cap.hardware += def.capBonus?.hardware ?? 0;
      state.cap.propellant += def.capBonus?.propellant ?? 0;
      if (state.buildingLevel[id] === 1) state.day.notes.push(`${id} built`);
      bought = true;
      break; // re-scan from the top of BUILD_PRIORITY next iteration
    }
    if (!bought) break;
  }

  // Extended Rail: one-time internal upgrade on Launch Rail, needed for S-2.
  if (
    state.buildingLevel.launchRail > 0 &&
    !state.extendedRailBought &&
    canAfford(state, { funding: 400, materials: 100 })
  ) {
    pay(state, { funding: 400, materials: 100 });
    state.extendedRailBought = true;
    state.day.notes.push('extendedRail bought');
  }
}

function resolveManualPitch(state: SimState): void {
  // One pitch per check-in, not the 1s cooldown max — see header note on bot policy
  // assumptions. `payrollUnpaid` is checked explicitly (not inferred from
  // passiveFundingRate <= 0): that rate is Finance's THEORETICAL output and stays
  // positive once Finance is built+staffed even while insolvency is actually blocking
  // production — GDD §1b names pitching as the explicit insolvency bail-out, so the bot
  // must not rely on the funding<200 fallback alone to notice it's insolvent. Without
  // this, funding landing exactly at/above 200 while insolvent is a real deadlock (found
  // via the "optimal" profile going fully idle for the v2.3 re-run — a sim bug, not an
  // economy one).
  if (state.payrollUnpaid || passiveFundingRate(state) <= 0 || state.resources.funding < 200) {
    const yieldAmount = pitchYield(state.buildingLevel.offices); // ECONOMY §2
    grant(state, 'funding', yieldAmount, true);
    state.day.fundingFromPitch += yieldAmount;
  }
}

// Funding Rounds (ECONOMY §2) are a Reputation-gated, better-yield alternative to
// pitching — "replaces nothing; pitch stays" per the doc, so this runs alongside
// resolveManualPitch, not instead of it. Prefers Round II once both are available.
function resolveFundingRounds(state: SimState): void {
  if (
    state.resources.reputation >= FUNDING_ROUND_II.reputationGate &&
    state.nowMs >= state.fundingRoundIINextAt
  ) {
    grant(state, 'funding', FUNDING_ROUND_II.yieldAmount, true);
    state.day.fundingFromFundingRounds += FUNDING_ROUND_II.yieldAmount;
    state.fundingRoundIINextAt = state.nowMs + FUNDING_ROUND_II.cooldownMs;
    return;
  }
  if (
    state.resources.reputation >= FUNDING_ROUND_I.reputationGate &&
    state.nowMs >= state.fundingRoundINextAt
  ) {
    grant(state, 'funding', FUNDING_ROUND_I.yieldAmount, true);
    state.day.fundingFromFundingRounds += FUNDING_ROUND_I.yieldAmount;
    state.fundingRoundINextAt = state.nowMs + FUNDING_ROUND_I.cooldownMs;
  }
}

function runDecisions(state: SimState): void {
  resolveManualPitch(state);
  resolveFundingRounds(state);
  resolveHiring(state);
  resolveConstruction(state);
  resolvePromotions(state);
}

// The next research node the bot would start, in priority order — the first not-yet-
// completed node whose deps are satisfied. Shared by startResearch() (to start it once
// affordable) and updateResearchStallTracking() (to notice when it ISN'T affordable for
// a long stretch — a "duration gate clear, blocked on Research points" scarcity signal).
function findNextResearchNode(state: SimState): ResearchNode | null {
  for (const id of RESEARCH_PRIORITY) {
    if (state.techCompleted.has(id)) continue;
    const node = RESEARCH_BY_ID.get(id)!;
    if (!node.deps.every((d) => state.techCompleted.has(d))) continue;
    return node;
  }
  return null;
}

function startResearch(state: SimState): void {
  if (state.researchTimer) return;
  const node = findNextResearchNode(state);
  if (!node) return;
  if (state.resources.research < node.costR) return; // wait for this one, don't skip ahead
  state.resources.research -= node.costR;
  state.researchTimer = {
    remainingMs: node.durationMs,
    onComplete: () => {
      state.techCompleted.add(node.id);
      state.day.notes.push(`tech: ${node.id}`);
    },
  };
}

const RESEARCH_STALL_THRESHOLD_MS = 12 * HOUR;

// Tracks how long the current next-eligible research node has sat unaffordable with no
// research in progress — a signal for whether the slower R&D Lab (v2.3) created a real
// scarcity bottleneck anywhere, not just a slower average. Runs every tick regardless of
// profile/session (it's an observation about the RESOURCE, not a player decision).
function updateResearchStallTracking(state: SimState): void {
  const node = state.researchTimer ? null : findNextResearchNode(state);
  if (!node || state.resources.research >= node.costR) {
    state.researchStallTracking = null;
    return;
  }
  if (state.researchStallTracking?.nodeId !== node.id) {
    state.researchStallTracking = { nodeId: node.id, sinceMs: state.nowMs, logged: false };
  }
  // Non-null: either just assigned above, or the ?. comparison above was false, which
  // only happens when researchStallTracking was already non-null with a matching nodeId.
  const tracking = state.researchStallTracking!;
  if (!tracking.logged && state.nowMs - tracking.sinceMs > RESEARCH_STALL_THRESHOLD_MS) {
    tracking.logged = true;
    state.researchStalls.push({ nodeId: node.id, day: Math.floor(state.nowMs / DAY_MS) + 1 });
  }
}

function startCertification(state: SimState): void {
  if (state.certTimer || state.buildingLevel.testStand === 0) return;

  if (!state.probe1Test1Done && canAfford(state, CERT_PROBE1_TEST1)) {
    pay(state, CERT_PROBE1_TEST1);
    state.certTimer = {
      kind: 'probe1Test1',
      remainingMs: CERT_DURATION,
      onComplete: () => {
        state.probe1Test1Done = true;
        grant(state, 'hardware', 6, true); // 60% recovery of the 10 spent, per GDD §7b
        grant(state, 'flightxp', SCRIPTED_FAILURE_REWARD.flightxp, true);
        grantFlightData(state, SCRIPTED_FAILURE_REWARD.researchFlightData);
        maybeAwardRecord(state, 'firstIgnition');
        state.day.notes.push('probe1 test1: scripted failure (N-07)');
      },
    };
    return;
  }
  if (state.probe1Test1Done && !state.probe1Test2Done && canAfford(state, CERT_PROBE1_TEST2)) {
    pay(state, CERT_PROBE1_TEST2);
    state.certTimer = {
      kind: 'probe1Test2',
      remainingMs: CERT_DURATION,
      onComplete: () => {
        state.probe1Test2Done = true;
        grant(state, 'flightxp', STATIC_FIRE_SUCCESS_REWARD.flightxp, true);
        grant(state, 'reputation', STATIC_FIRE_SUCCESS_REWARD.reputation, true);
        grantFlightData(state, STATIC_FIRE_SUCCESS_REWARD.researchFlightData);
        state.day.notes.push('probe1 certified (static fire success)');
      },
    };
    return;
  }
  if (state.probe1Test2Done && !state.probe1ExtendedDone && canAfford(state, CERT_PROBE1_EXT)) {
    pay(state, CERT_PROBE1_EXT);
    state.certTimer = {
      kind: 'probe1Extended',
      remainingMs: CERT_DURATION,
      onComplete: () => {
        state.probe1ExtendedDone = true;
        state.day.notes.push('probe1 extended cert (S-1/S-2 now guaranteed)');
      },
    };
    return;
  }
  if (
    state.techCompleted.has('orbital1Engine') &&
    !state.orbital1BaseDone &&
    canAfford(state, CERT_ORBITAL1_BASE)
  ) {
    pay(state, CERT_ORBITAL1_BASE);
    state.certTimer = {
      kind: 'orbital1Base',
      remainingMs: ORBITAL1_BASE_DURATION,
      onComplete: () => {
        if (rng() < ORBITAL1_SUCCESS_RATE) {
          state.orbital1BaseDone = true;
          grant(state, 'flightxp', STATIC_FIRE_SUCCESS_REWARD.flightxp, true);
          grantFlightData(state, STATIC_FIRE_SUCCESS_REWARD.researchFlightData);
          grant(state, 'reputation', STATIC_FIRE_SUCCESS_REWARD.reputation, true);
          state.day.notes.push('orbital1 certified');
        } else {
          grant(state, 'flightxp', ORBITAL1_FAILURE_FLIGHT_XP, true);
          state.day.notes.push('orbital1 cert failed (retry at half duration)');
          // Retry immediately at half duration (ECONOMY §6), no extra resource cost
          // modeled for the retry attempt itself. The sim simplifies the retry to a
          // deterministic success (a second real 80% roll would rarely change the
          // pacing outcome and isn't worth the extra state) — real code
          // (core/certification.ts) keeps rolling every retry for real.
          state.certTimer = {
            kind: 'orbital1Base',
            remainingMs: ORBITAL1_RETRY_DURATION,
            onComplete: () => {
              state.orbital1BaseDone = true; // retry succeeds deterministically in-sim
              grant(state, 'flightxp', STATIC_FIRE_SUCCESS_REWARD.flightxp, true);
              grantFlightData(state, STATIC_FIRE_SUCCESS_REWARD.researchFlightData);
              grant(state, 'reputation', STATIC_FIRE_SUCCESS_REWARD.reputation, true);
              state.day.notes.push('orbital1 certified (retry)');
            },
          };
        }
      },
    };
    return;
  }
  if (
    state.orbital1BaseDone &&
    !state.orbital1ExtendedDone &&
    canAfford(state, CERT_ORBITAL1_EXT)
  ) {
    pay(state, CERT_ORBITAL1_EXT);
    state.certTimer = {
      kind: 'orbital1Extended',
      remainingMs: ORBITAL1_EXT_DURATION,
      onComplete: () => {
        state.orbital1ExtendedDone = true;
        state.day.notes.push('orbital1 extended cert (Aurora I now guaranteed)');
      },
    };
  }
}

function maybeAwardRecord(state: SimState, id: keyof typeof RECORDS): void {
  if (state.recordsAwarded.has(id)) return;
  state.recordsAwarded.add(id);
  const reward = RECORDS[id];
  grant(state, 'funding', reward.funding, true);
  grant(state, 'reputation', reward.reputation, true);
  state.day.fundingFromRecords += reward.funding;
  state.day.notes.push(`record: ${id}`);
}

function startSonda(state: SimState): void {
  if (state.sondaTimer || state.buildingLevel.launchRail === 0) return;
  if (!state.probe1Test2Done) return; // certification "powers" S-1/S-2 (ECONOMY §6)

  // Fly S-2 once: Extended Rail bought, Probe-1 extended cert (guaranteed Confidence),
  // and enough Flight Data research spend for the flight review.
  const canFlyS2 =
    state.extendedRailBought &&
    state.probe1ExtendedDone &&
    !state.s2Flown &&
    state.s1Flights >= 3 && // don't rush past the sonda campaign immediately
    state.resources.research >= S2_FLIGHT_REVIEW_R &&
    canAfford(state, { hardware: S2_ASSEMBLY.hardware });

  if (canFlyS2) {
    state.resources.research -= S2_FLIGHT_REVIEW_R;
    pay(state, { hardware: S2_ASSEMBLY.hardware });
    // Assembly + weather window folded into one timer (no separate phase state kept —
    // both S-1 and S-2 checklists include a weather window, ECONOMY §7a/§11).
    state.sondaTimer = {
      kind: 's2',
      remainingMs: S2_ASSEMBLY.durationMs + S1_WEATHER_MS,
      onComplete: () => {},
    };
    return;
  }

  if (canAfford(state, { hardware: S1_ASSEMBLY.hardware })) {
    pay(state, { hardware: S1_ASSEMBLY.hardware });
    state.sondaTimer = {
      kind: 's1',
      remainingMs: S1_ASSEMBLY.durationMs + S1_WEATHER_MS,
      onComplete: () => {},
    };
  }
}

function tickSonda(state: SimState, deltaMs: number): void {
  if (!state.sondaTimer) return;
  const propellantNeeded = state.sondaTimer.kind === 's1' ? S1_LAUNCH_PROPELLANT : S2_LAUNCH_PROPELLANT;
  state.sondaTimer.remainingMs -= deltaMs;
  if (state.sondaTimer.remainingMs > 0) return;
  if (state.resources.propellant < propellantNeeded) {
    state.sondaTimer.remainingMs = 0; // hold at zero, waiting for propellant
    return;
  }
  state.resources.propellant -= propellantNeeded;
  if (state.sondaTimer.kind === 's1') {
    state.s1Flights += 1;
    grant(state, 'flightxp', S1_REWARD.flightxp, true);
    grantFlightData(state, S1_REWARD.researchFlightData);
    grant(state, 'reputation', S1_REWARD.reputation, true);
    // ECONOMY §8b (v2.2): "First flight" triggers on the first S-1 sonda LAUNCH (lifted
    // off) — same spirit as "First ignition (even the scripted failure)", not gated on
    // success. The sim doesn't model S-1 failure (see header note), so "launched" and
    // "succeeded" are the same event here regardless.
    if (state.s1Flights === 1) maybeAwardRecord(state, 'firstFlight');
  } else {
    state.s2Flown = true;
    state.s2FlownDay = Math.floor(state.nowMs / DAY_MS) + 1;
    grant(state, 'flightxp', S2_REWARD.flightxp, true);
    grantFlightData(state, S2_REWARD.researchFlightData);
    grant(state, 'reputation', S2_REWARD.reputation, true);
    maybeAwardRecord(state, 'pastKarman'); // first successful S-2, ECONOMY §8b
    state.day.notes.push('S-2 launched: past the Karman line');
  }
  state.sondaTimer = null;
}

function resolveContracts(state: SimState): void {
  if (state.buildingLevel.launchRail === 0) return;
  if (!state.contractTimer && state.contractCooldownMs <= 0) {
    state.contractsAccepted += 1;
    maybeAwardRecord(state, 'firstCustomer');
    state.contractTimer = { remainingMs: TIER0_CONTRACT_BUILD_MS, onComplete: () => {} };
  }
}

function tickContract(state: SimState, deltaMs: number): void {
  if (state.contractCooldownMs > 0) state.contractCooldownMs -= deltaMs;
  if (!state.contractTimer) return;
  state.contractTimer.remainingMs -= deltaMs;
  if (state.contractTimer.remainingMs > 0) return;
  if (!canAfford(state, TIER0_CONTRACT_COST)) {
    state.contractTimer.remainingMs = 0;
    return;
  }
  pay(state, TIER0_CONTRACT_COST);
  const reward = CONTRACT_REWARDS[0];
  grant(state, 'funding', reward.funding, true);
  grant(state, 'reputation', reward.reputation, true);
  grant(state, 'flightxp', reward.flightxp, true);
  grantFlightData(state, reward.researchFlightData);
  state.day.fundingFromContracts += reward.funding;
  state.contractsFulfilled += 1;
  maybeAwardRecord(state, 'firstDelivery');
  state.contractTimer = null;
  state.contractCooldownMs = TIER0_CONTRACT_ROTATION_MS;
}

function startAuroraStage(state: SimState): void {
  if (state.auroraILaunched || state.auroraTimer) return;
  const complexDReady =
    state.buildingLevel.vab > 0 &&
    state.buildingLevel.launchPad > 0 &&
    state.buildingLevel.launchControl > 0 &&
    state.buildingLevel.trackingStation > 0;
  if (!complexDReady) return;
  if (!state.techCompleted.has('orbitalFlight')) return;
  if (!state.orbital1ExtendedDone) return; // guaranteed-Confidence path only (see header)

  const stage = AURORA_I_STAGES[state.auroraStageIndex];
  if (!canAfford(state, stage.cost)) return;
  pay(state, stage.cost);
  state.auroraTimer = { remainingMs: stage.durationMs, onComplete: () => {} };
}

function tickAurora(state: SimState, deltaMs: number): void {
  if (!state.auroraTimer) return;
  state.auroraTimer.remainingMs -= deltaMs;
  if (state.auroraTimer.remainingMs > 0) return;
  state.day.notes.push(`Aurora I: ${AURORA_I_STAGES[state.auroraStageIndex].id} done`);
  state.auroraTimer = null;
  state.auroraStageIndex += 1;
  if (state.auroraStageIndex >= AURORA_I_STAGES.length) {
    state.auroraILaunched = true;
    state.auroraILaunchedDay = Math.floor(state.nowMs / DAY_MS) + 1;
    grant(state, 'flightxp', AURORA_I_SIM_REWARD.flightxp, true);
    grantFlightData(state, AURORA_I_SIM_REWARD.researchFlightData);
    grant(state, 'reputation', AURORA_I_SIM_REWARD.reputation, true);
    maybeAwardRecord(state, 'firstOrbit'); // Aurora I success, ECONOMY §8b
    state.day.notes.push('AURORA I LAUNCHED — first satellite in orbit');
  }
}

// ---------------------------------------------------------------------------
// Per-tick simulation
// ---------------------------------------------------------------------------
const TICK_MS = MIN;
// "optimal" profile only: spending decisions are evaluated on a check-in cadence
// rather than every tick, so an always-on bot doesn't out-react any real player and
// trivially outrace the exponential cost curves. "human" profile ignores this entirely
// in favor of its session schedule (see isInSession()).
const DECISION_INTERVAL_MS = 15 * MIN;

function tick(state: SimState, profile: Profile): void {
  const dtSec = TICK_MS / 1000;

  // 1. Resolve running timers first (so completions can feed this tick's decisions).
  // These always run at 100% regardless of profile/session — ECONOMY §11: "process
  // timers run at 100%" even offline.
  if (state.researchTimer) {
    state.researchTimer.remainingMs -= TICK_MS;
    if (state.researchTimer.remainingMs <= 0) {
      state.researchTimer.onComplete();
      state.researchTimer = null;
    }
  }
  if (state.certTimer) {
    state.certTimer.remainingMs -= TICK_MS;
    if (state.certTimer.remainingMs <= 0) {
      const done = state.certTimer.onComplete;
      state.certTimer = null;
      done();
    }
  }
  if (state.promotionTimer) {
    state.promotionTimer.remainingMs -= TICK_MS;
    if (state.promotionTimer.remainingMs <= 0) {
      const done = state.promotionTimer.onComplete;
      state.promotionTimer = null;
      done();
    }
  }
  tickSonda(state, TICK_MS);
  tickContract(state, TICK_MS);
  tickAurora(state, TICK_MS);
  updateResearchStallTracking(state);

  // 2. Determine this tick's activity state and resource-rate multiplier.
  let active: boolean;
  let rateMultiplier: number;
  if (profile === 'optimal') {
    active = true; // always-on bot, no session/offline concept
    rateMultiplier = 1;
  } else {
    active = isInSession(state.nowMs);
    if (active) {
      state.offlineElapsedMs = 0;
      rateMultiplier = 1;
    } else {
      state.offlineElapsedMs += TICK_MS;
      const offlineCap = state.techCompleted.has('remoteOps')
        ? OFFLINE_CAP_MS_EXTENDED
        : OFFLINE_CAP_MS_BASE;
      // Beyond the offline cap, ECONOMY §11 doesn't say gains/losses keep accruing at a
      // reduced rate forever — the cap is what bounds "While you were away." Treated
      // here as a hard stop (rate 0) past the cap, resuming at the next session.
      rateMultiplier = state.offlineElapsedMs <= offlineCap ? OFFLINE_RATE : 0;
    }
  }

  // 3. Salaries (paid before production — insolvency pauses staffed production, GDD
  // §1b). Scaled by rateMultiplier: "salaries also run offline at 60%" (ECONOMY §11).
  const salaryCost =
    Object.entries(state.staffHired).reduce(
      (sum, [role, n]) => sum + n * ROLES[role as RoleId].salaryPerSec,
      0,
    ) *
    dtSec *
    rateMultiplier;
  const canPaySalaries = state.resources.funding >= salaryCost;
  if (canPaySalaries) {
    state.resources.funding -= salaryCost;
    state.day.salaryPaid += salaryCost;
    state.payrollUnpaid = false;
  } else {
    state.payrollUnpaid = true;
    state.day.payrollUnpaidMs += TICK_MS;
  }

  // 4. Passive production (paused while payroll is unpaid, per GDD §1b; scaled by the
  // same rateMultiplier as salaries).
  if (canPaySalaries && rateMultiplier > 0) {
    const financeAmount =
      productionPerSecond(
        BUILDINGS.finance.production!.basePerSec,
        state.buildingLevel.finance,
        requiredSlots(state, 'technician') > 0
          ? Math.min(state.staffHired.technician, BUILDINGS.finance.slots!.technician!) /
              BUILDINGS.finance.slots!.technician!
          : 0,
      ) *
      dtSec *
      rateMultiplier;
    grant(state, 'funding', financeAmount, false);
    state.day.fundingFromPassive += financeAmount;

    const rndAmount =
      productionPerSecond(
        BUILDINGS.rndLab.production!.basePerSec,
        state.buildingLevel.rndLab,
        state.staffHired.scientist > 0
          ? Math.min(state.staffHired.scientist, BUILDINGS.rndLab.slots!.scientist!) /
              BUILDINGS.rndLab.slots!.scientist!
          : 0,
      ) *
      dtSec *
      rateMultiplier;
    grant(state, 'research', rndAmount, false);
    state.day.researchFromLab += rndAmount;

    const supplyAmount =
      productionPerSecond(
        BUILDINGS.supplyDepot.production!.basePerSec,
        state.buildingLevel.supplyDepot,
        state.staffHired.technician > 0 ? 1 : 0, // approximate: shared technician pool
      ) *
      dtSec *
      rateMultiplier;
    grant(state, 'materials', supplyAmount, false);

    const fabLevel = state.buildingLevel.fabrication;
    if (fabLevel > 0 && state.staffHired.engineer > 0) {
      const hardwareAmount =
        productionPerSecond(BUILDINGS.fabrication.production!.basePerSec, fabLevel, 1) *
        dtSec *
        rateMultiplier;
      const materialsNeeded = hardwareAmount * 2; // consumes 2 M per Hardware, ECONOMY §4
      if (state.resources.materials >= materialsNeeded) {
        state.resources.materials -= materialsNeeded;
        grant(state, 'hardware', hardwareAmount, false);
      }
    }
    const refLevel = state.buildingLevel.refinery;
    if (refLevel > 0 && state.staffHired.engineer > 0) {
      const propellantAmount =
        productionPerSecond(BUILDINGS.refinery.production!.basePerSec, refLevel, 1) *
        dtSec *
        rateMultiplier;
      if (state.resources.materials >= propellantAmount) {
        state.resources.materials -= propellantAmount;
        grant(state, 'propellant', propellantAmount, false);
      }
    }
  }

  // 5. Bot decisions — "optimal" keeps its 15-min check-in cadence around the clock;
  // "human" only acts while inside a session.
  const decisionGate = profile === 'optimal' ? state.nowMs % DECISION_INTERVAL_MS === 0 : active;
  if (decisionGate) runDecisions(state);

  // STARTING a new process (research node, certification test, sonda assembly,
  // accepting a contract) is a player action too — a mini-checklist launch or "accept
  // offer" click, not passive machinery — so it's gated the same way. This is distinct
  // from letting an ALREADY-STARTED process's timer complete (tickSonda/tickContract/
  // the timer blocks above), which run every tick regardless, matching ECONOMY §11's
  // "process timers run at 100%" even offline. "optimal" has no session concept, so
  // `canStartNewProcess` is always true for it — unchanged from before this fix.
  const canStartNewProcess = profile === 'optimal' || active;
  if (canStartNewProcess) {
    startResearch(state);
    startCertification(state);
    startSonda(state);
    resolveContracts(state);
  }
  // Exception: "VAB queues" (ECONOMY §5) is literally the auto-queue-VAB-stages
  // research node — once researched, the next stage starts without anyone present.
  if (canStartNewProcess || state.techCompleted.has('vabQueues')) {
    startAuroraStage(state);
  }

  state.nowMs += TICK_MS;
}

// ---------------------------------------------------------------------------
// Run + CSV output
// ---------------------------------------------------------------------------
// ECONOMY §8 v2.3: Flight Data target is per-era. See SimState.firstFlightDataDay for
// the boundary rule.
type Era = 'preFlight' | 'sonda' | 'satellite';

function classifyEra(day: number, state: SimState): Era {
  if (state.firstFlightDataDay === null || day < state.firstFlightDataDay) return 'preFlight';
  if (state.auroraILaunchedDay === null || day < state.auroraILaunchedDay) return 'sonda';
  return 'satellite';
}

interface DayRow {
  day: number;
  era: Era;
  funding: number;
  materials: number;
  hardware: number;
  propellant: number;
  research: number;
  reputation: number;
  flightxp: number;
  fundingIncome: number;
  fundingFromPitch: number;
  fundingFromFundingRounds: number;
  fundingFromPassive: number;
  fundingFromContracts: number;
  fundingFromRecords: number;
  fundingExpense: number;
  salaryPaid: number;
  salaryRatioPct: string;
  researchFromLab: number;
  researchFromFlightData: number;
  flightDataSharePct: string;
  payrollUnpaidMin: number;
  notes: string;
}

interface SimulationResult {
  profile: Profile;
  rows: DayRow[];
  state: SimState;
  outPath: string;
  seed: number;
  days: number;
}

function runSimulation(profile: Profile, seed: number = SEED, days: number = DAYS): SimulationResult {
  rng = mulberry32(seed); // fresh, identical sequence per profile for fair comparison

  const state = createState();
  // Era isn't known until the run completes (it depends on when — or whether —
  // firstFlightDataDay/auroraILaunchedDay happen, which may be on a later day than the
  // row being pushed). Collected without `era` here; annotated in one pass below.
  const rows: Omit<DayRow, 'era'>[] = [];
  const totalTicks = days * 24 * 60; // TICK_MS = 1 min
  let ticksIntoDay = 0;
  const ticksPerDay = 24 * 60;

  for (let i = 0; i < totalTicks; i++) {
    tick(state, profile);
    ticksIntoDay++;
    if (ticksIntoDay >= ticksPerDay) {
      const dayIndex = rows.length + 1;
      const income =
        state.day.fundingFromPitch +
        state.day.fundingFromFundingRounds +
        state.day.fundingFromPassive +
        state.day.fundingFromContracts +
        state.day.fundingFromRecords;
      const expense =
        state.day.salaryPaid + state.day.fundingSpentOnPurchases + state.day.fundingSpentOnHires;
      const totalResearch = state.day.researchFromLab + state.day.researchFromFlightData;
      rows.push({
        day: dayIndex,
        funding: Math.round(state.resources.funding),
        materials: Math.round(state.resources.materials),
        hardware: Math.round(state.resources.hardware),
        propellant: Math.round(state.resources.propellant),
        research: Math.round(state.resources.research),
        reputation: Math.round(state.resources.reputation),
        flightxp: Math.round(state.resources.flightxp),
        fundingIncome: Math.round(income),
        fundingFromPitch: Math.round(state.day.fundingFromPitch),
        fundingFromFundingRounds: Math.round(state.day.fundingFromFundingRounds),
        fundingFromPassive: Math.round(state.day.fundingFromPassive),
        fundingFromContracts: Math.round(state.day.fundingFromContracts),
        fundingFromRecords: Math.round(state.day.fundingFromRecords),
        fundingExpense: Math.round(expense),
        salaryPaid: Math.round(state.day.salaryPaid),
        salaryRatioPct:
          state.day.fundingFromPassive > 0
            ? ((state.day.salaryPaid / state.day.fundingFromPassive) * 100).toFixed(1)
            : 'n/a',
        researchFromLab: Math.round(state.day.researchFromLab),
        researchFromFlightData: Math.round(state.day.researchFromFlightData),
        flightDataSharePct:
          totalResearch > 0 ? ((state.day.researchFromFlightData / totalResearch) * 100).toFixed(1) : 'n/a',
        payrollUnpaidMin: Math.round(state.day.payrollUnpaidMs / MIN),
        notes: state.day.notes.join('; '),
      });
      state.day = freshDayAccumulator();
      ticksIntoDay = 0;
    }
  }

  const finalRows: DayRow[] = rows.map(({ day, ...rest }) => ({
    day,
    era: classifyEra(day, state),
    ...rest,
  }));

  const header = Object.keys(finalRows[0] ?? {}) as (keyof DayRow)[];
  const csvLines = [
    header.join(','),
    ...finalRows.map((r) => header.map((h) => csvEscape(String(r[h]))).join(',')),
  ];

  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'output');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `day-by-day-${profile}-seed${seed}-${days}d.csv`);
  writeFileSync(outPath, csvLines.join('\n') + '\n', 'utf-8');

  return { profile, rows: finalRows, state, outPath, seed, days };
}

function csvEscape(value: string): string {
  return value.includes(',') || value.includes(';') ? `"${value.replace(/"/g, '""')}"` : value;
}

function printSummary({ profile, rows, state, outPath, seed, days }: SimulationResult): void {
  console.log(`\n=== Aurora Program — balance simulator: "${profile}" profile (seed ${seed}, ${days} days) ===`);
  console.log(`CSV written to ${outPath} (${rows.length} rows)\n`);

  console.log('Milestones reached:');
  console.log(`  Complex B unlocked:   ${state.lifetimeFunding >= 300 ? 'yes' : 'no'}`);
  console.log(`  Test Stand built:     ${state.buildingLevel.testStand > 0 ? 'yes' : 'no'}`);
  console.log(`  First S-1 flight:     ${state.s1Flights > 0 ? 'yes' : 'no'} (${state.s1Flights} total)`);
  console.log(`  Flight program tech:  ${state.techCompleted.has('flightProgram') ? 'yes' : 'no'}`);
  console.log(`  S-2 / Kármán line:    ${state.s2Flown ? 'yes' : 'no'}`);
  console.log(
    `  Aurora I launched:    ${state.auroraILaunched ? `yes (day ${state.auroraILaunchedDay})` : 'no'}`,
  );
  console.log(`  Contracts fulfilled:  ${state.contractsFulfilled}`);

  // Checkpoint rows: 5 evenly spaced days across the run (arc-milestone checkpoints
  // would need those milestones to land inside DAYS; falling back to evenly-spaced
  // sampling keeps this meaningful even for short runs).
  console.log('\nSalary ratio at 5 checkpoints (target: 30-55% of passive Funding income):');
  const checkpointCount = Math.min(5, rows.length);
  for (let c = 1; c <= checkpointCount; c++) {
    const idx = Math.floor((rows.length * c) / checkpointCount) - 1;
    const row = rows[Math.max(0, idx)];
    console.log(`  Day ${row.day}: ${row.salaryRatioPct}%`);
  }

  // ECONOMY §8 v2.3: target reformulated as a per-era range, checked separately for
  // sonda and satellite (pre-flight is reported too, but has no target — it's lab-only
  // by construction, before any flight has happened).
  console.log('\nFlight Data share of Research income, per era:');
  for (const era of ['preFlight', 'sonda', 'satellite'] as const) {
    const eraRows = rows.filter((r) => r.era === era);
    if (eraRows.length === 0) {
      console.log(`  ${era}: no days in this run`);
      continue;
    }
    const totalLab = eraRows.reduce((s, r) => s + r.researchFromLab, 0);
    const totalFlight = eraRows.reduce((s, r) => s + r.researchFromFlightData, 0);
    const totalResearch = totalLab + totalFlight;
    const pct = totalResearch > 0 ? ((totalFlight / totalResearch) * 100).toFixed(1) : 'n/a';
    const targetNote = era === 'preFlight' ? '(no target — lab-only by design)' : '(target 20-35%)';
    console.log(`  ${era} (${eraRows.length} days): ${pct}% ${targetNote}`);
  }

  // ECONOMY §8 v2.3: codified pacing floor — human profile must not reach Aurora I
  // before simulated day 5 (a real player, with FTUE friction and mistakes the bot
  // doesn't make, will be slower still). Always reported, pass or fail.
  if (profile === 'human') {
    const floorOk = state.auroraILaunchedDay === null || state.auroraILaunchedDay >= 5;
    console.log(
      `\nPacing floor (human must not reach Aurora I before day 5): ${
        floorOk ? 'PASS' : 'FAIL'
      }${state.auroraILaunchedDay !== null ? ` (reached day ${state.auroraILaunchedDay})` : ' (not reached)'}`,
    );
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Multi-seed sweep — human profile only. A single seed's result (e.g. the day-5 run
// this was built for) can't tell scarcity apart from bad luck; sweeping seeds does.
// ---------------------------------------------------------------------------
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function eraFlightDataSharePct(rows: DayRow[], era: Era): number | null {
  const eraRows = rows.filter((r) => r.era === era);
  const totalLab = eraRows.reduce((s, r) => s + r.researchFromLab, 0);
  const totalFlight = eraRows.reduce((s, r) => s + r.researchFromFlightData, 0);
  const total = totalLab + totalFlight;
  return total > 0 ? (totalFlight / total) * 100 : null;
}

interface SweepSeedResult {
  seed: number;
  auroraIDay: number | null;
  karmanDay: number | null;
  sondaSharePct: number | null;
  satelliteSharePct: number | null;
  stalls: { nodeId: string; day: number }[];
}

function reportStat(label: string, values: (number | null)[], total: number, unit = ''): void {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) {
    console.log(`  ${label}: never (0/${total} seeds)`);
    return;
  }
  const min = Math.min(...present);
  const max = Math.max(...present);
  console.log(
    `  ${label}: median ${median(present).toFixed(1)}${unit}, range ${min.toFixed(1)}-${max.toFixed(1)}${unit}` +
      (present.length < total ? ` (${present.length}/${total} seeds reached this point)` : ''),
  );
}

function runSweep(): void {
  const seeds = Array.from({ length: 10 }, (_, i) => i + 1); // 1-10
  const days = Number(args.days ?? 45);

  const results: SweepSeedResult[] = seeds.map((seed) => {
    const { rows, state } = runSimulation('human', seed, days);
    return {
      seed,
      auroraIDay: state.auroraILaunchedDay,
      karmanDay: state.s2FlownDay,
      sondaSharePct: eraFlightDataSharePct(rows, 'sonda'),
      satelliteSharePct: eraFlightDataSharePct(rows, 'satellite'),
      stalls: state.researchStalls,
    };
  });

  // Summary CSV for the record, alongside the per-seed day-by-day CSVs runSimulation
  // already wrote.
  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'output');
  mkdirSync(outDir, { recursive: true });
  const summaryPath = join(outDir, `sweep-summary-human-seeds${seeds[0]}-${seeds[seeds.length - 1]}-${days}d.csv`);
  const summaryHeader = [
    'seed',
    'auroraIDay',
    'karmanDay',
    'sondaFlightDataSharePct',
    'satelliteFlightDataSharePct',
    'stallCount',
    'stallDetails',
  ];
  const summaryLines = [
    summaryHeader.join(','),
    ...results.map((r) =>
      [
        r.seed,
        r.auroraIDay ?? '',
        r.karmanDay ?? '',
        r.sondaSharePct?.toFixed(1) ?? '',
        r.satelliteSharePct?.toFixed(1) ?? '',
        r.stalls.length,
        csvEscape(r.stalls.map((s) => `${s.nodeId}@day${s.day}`).join('; ')),
      ].join(','),
    ),
  ];
  writeFileSync(summaryPath, summaryLines.join('\n') + '\n', 'utf-8');

  console.log(`\n=== Multi-seed sweep — "human" profile, seeds ${seeds[0]}-${seeds[seeds.length - 1]}, ${days} days ===`);
  console.log(`Summary CSV: ${summaryPath}\n`);

  reportStat(
    'Days to Aurora I',
    results.map((r) => r.auroraIDay),
    results.length,
    ' days',
  );
  reportStat(
    'Days to Kármán line (first S-2 success)',
    results.map((r) => r.karmanDay),
    results.length,
    ' days',
  );

  console.log('\nFlight Data share per era (target 20-35%):');
  reportStat(
    'sonda',
    results.map((r) => r.sondaSharePct),
    results.length,
    '%',
  );
  reportStat(
    'satellite',
    results.map((r) => r.satelliteSharePct),
    results.length,
    '%',
  );

  console.log('\nResearch stalls (an eligible node — deps clear — unaffordable for >12 simulated hours):');
  const seedsWithStalls = results.filter((r) => r.stalls.length > 0);
  if (seedsWithStalls.length === 0) {
    console.log('  None observed across any seed.');
  } else {
    for (const r of seedsWithStalls) {
      console.log(`  seed ${r.seed}: ${r.stalls.map((s) => `${s.nodeId} (day ${s.day})`).join(', ')}`);
    }
  }

  console.log('\n=== Decision-rule check (owner\'s rule, reported not applied) ===');
  const sondaMedian = median(results.map((r) => r.sondaSharePct).filter((v): v is number => v !== null));
  const satelliteMedian = median(
    results.map((r) => r.satelliteSharePct).filter((v): v is number => v !== null),
  );
  console.log(
    `  Median sonda share: ${sondaMedian.toFixed(1)}% — ${sondaMedian < 20 ? 'UNDER 20%' : sondaMedian <= 35 ? 'in 20-35% range' : 'OVER 35%'}`,
  );
  console.log(
    `  Median satellite share: ${satelliteMedian.toFixed(1)}% — ${satelliteMedian < 20 ? 'UNDER 20%' : satelliteMedian <= 35 ? 'in 20-35% range' : 'OVER 35%'}`,
  );
  console.log('  No ECONOMY_MODEL value was changed by this run — reporting only.\n');
}

function main(): void {
  const optimal = runSimulation('optimal');
  const human = runSimulation('human');

  printSummary(optimal);
  printSummary(human);

  console.log('=== Profile comparison ===');
  const fmt = (r: SimulationResult) =>
    r.state.auroraILaunched ? `day ${r.state.auroraILaunchedDay}` : `not reached within ${r.days} days`;
  console.log(`  Days to Aurora I — optimal: ${fmt(optimal)}`);
  console.log(`  Days to Aurora I — human:   ${fmt(human)}`);

  // Codified pacing floor (ECONOMY §8 v2.3): report the fact, don't act on it. No
  // ECONOMY value is touched by this simulator, ever — see printSummary()'s per-profile
  // PASS/FAIL line for the same check.
  if (human.state.auroraILaunchedDay !== null && human.state.auroraILaunchedDay < 5) {
    console.log(
      '\n  FLAG: "human" profile reached Aurora I before simulated day 5 (the codified ' +
        'pacing floor, ECONOMY §8 v2.3). Signal for the design owner to retune ' +
        'ECONOMY_MODEL.md — no values were changed by this run.',
    );
  }
  console.log('');
}

if (args.sweep === 'true') {
  runSweep();
} else {
  main();
}
