// Shared state schema — transcribed from CLAUDE.md "Data schemas". This file is the
// single source of truth for types; CLAUDE.md is the single source of truth for the
// contract it must keep matching.

export type ResourceId =
  | 'funding'
  | 'research'
  | 'materials'
  | 'hardware'
  | 'propellant'
  | 'reputation'
  | 'flightxp';

export interface ResourceState {
  amount: number;
  cap: number | null;
  lifetimeEarned: number;
}

export type HardwareTier = 'aluminum' | 'titanium'; // 'composites' reserved for v2

export interface HardwareState extends ResourceState {
  byTier: Record<HardwareTier, number>; // invariant: sum(byTier) === amount; single shared cap
}

export type RoleId = 'technician' | 'engineer' | 'scientist' | 'controller';

export interface StaffState {
  pools: Record<RoleId, { hired: number; assigned: Record<BuildingId, number> }>;
  astronauts: Astronaut[]; // empty in v1; schema fixed now to avoid migration
}

export interface Astronaut {
  id: string;
  name: string;
  originRole: RoleId;
  skill: number;
  status: 'training' | 'available' | 'on_mission';
  missionsFlown: number;
}

export type ComplexId = 'campus' | 'production' | 'testing' | 'launch';

// Stable building ids (GDD §3 / ECONOMY_MODEL §4) — 18 buildings across 4 complexes.
export type BuildingId =
  // Complex A — Campus
  | 'offices'
  | 'finance'
  | 'rndLab'
  | 'crewQuarters'
  | 'trainingCenter'
  // Complex B — Production
  | 'supplyDepot'
  | 'fabrication'
  | 'refinery'
  | 'warehouse'
  | 'propellantDepot'
  // Complex C — Testing
  | 'testStand'
  | 'launchRail'
  | 'payloadProcessing'
  // Complex D — Launch
  | 'vab'
  | 'launchPad'
  | 'launchControl'
  | 'trackingStation'
  | 'launchPadB';

// CLAUDE.md references `UnlockCondition` without defining its shape; variants below
// cover every trigger named across GDD/ECONOMY_MODEL (lifetime funding, tech, reputation,
// named mission events, composite gates) so buildings never need an unmodeled condition later.
export type UnlockCondition =
  | { kind: 'start' } // available from game start
  | { kind: 'lifetimeFunding'; amount: number }
  | { kind: 'tech'; id: string }
  | { kind: 'reputation'; amount: number }
  // Resolved v2.2 (GDD changelog + ECONOMY §4): "Launch 1"/"1st launch" wording is
  // retired everywhere. Gates Payload Processing (GDD §3) and Launch Pad B (ECONOMY
  // §4), both keyed to this single named event — the first successful orbital launch.
  | { kind: 'auroraISuccess' }
  | { kind: 'buildingLevel'; building: BuildingId; level: number }
  | { kind: 'all'; conditions: UnlockCondition[] } // AND-compound (e.g. Launch Pad B)
  | { kind: 'locked' }; // visible-but-locked in v1 (e.g. Training Center)

export interface InternalUpgradeDef {
  id: string;
  name: string;
  cost: Partial<Record<ResourceId, number>>;
  minHardwareTier?: HardwareTier;
  description: string; // rule 9: label only — narrative copy still lives in NARRATIVE_EVENTS.md
}

export interface BuildingDef {
  id: BuildingId;
  name: string; // display label, GDD §3's canonical building names
  complex: ComplexId;
  baseCost: Partial<Record<ResourceId, number>>;
  costFactor: number | null; // null => one-time (non-leveled) building
  minHardwareTier?: HardwareTier;
  production?: {
    resource: ResourceId;
    basePerSec: number;
    consumes?: Partial<Record<ResourceId, number>>;
  };
  slots?: Partial<Record<RoleId, number>>;
  capBonus?: Partial<Record<ResourceId, number>>;
  // Staff is not a ResourceId (see StaffState note above) — Crew Quarters uses this
  // (+3/level); starting cap 2 before any Crew Quarters level (ECONOMY §1).
  staffCapBonus?: number;
  // UI_SPEC §2b progressive disclosure: default is hidden until unlockCondition is met.
  // teaser: true renders the tile locked-with-condition BEFORE that (v1: Training
  // Center only — the deliberate "there's more coming" tease). Absent/false = default.
  teaser?: boolean;
  internalUpgrades?: InternalUpgradeDef[];
  unlockCondition: UnlockCondition;
}

export type ProcessKind =
  | 'research'
  | 'certification'
  | 'integration'
  | 'transfer'
  | 'training'
  | 'contract_build'
  | 'weather_window';

export interface Process {
  id: string;
  kind: ProcessKind;
  startedAt: number;
  durationMs: number;
  payload: Record<string, unknown>;
}

export interface Modifier {
  id: string;
  source: string;
  target: string; // e.g. 'certification.duration'
  op: 'mult' | 'add';
  value: number;
}

// Missions are PER PAD from schemaVersion 1 (GDD/CLAUDE.md) — Pad B must not require a migration.
export type PadId = 'padA' | 'padB';

export type ChecklistItemId =
  | 'rocketIntegrated'
  | 'enginesCertified'
  | 'transferToPad'
  | 'propellantLoaded'
  | 'flightReview'
  | 'controllersOnStation'
  | 'trackingActive'
  | 'weatherWindow';

export interface PadMissionState {
  rocketStatus: 'none' | 'integrating' | 'in_vab' | 'transferring' | 'on_pad';
  stagesDone: string[];
  checklist: Record<ChecklistItemId, boolean>;
  confidence: number;
  committedRoll: number | null; // drawn at checklist completion (rule 12); null until then
}

export interface LaunchRecord {
  id: string;
  padId: PadId;
  missionType: 'staticFireTest' | 's1' | 's2' | 'auroraI' | 'auroraII' | 'contract';
  success: boolean;
  timestamp: number;
}

export interface MissionState {
  pads: Partial<Record<PadId, PadMissionState>>; // v1 start: { padA: … }; padB added when built
  launches: LaunchRecord[];
}

export interface EconomyFlags {
  payrollUnpaid: boolean; // GDD §1b insolvency state, drives UI banner
}

// ECONOMY §4b (v2.7): input-starved consumers pause per building, per tick, binary.
// starvedIndicator is the DISPLAYED state (hysteresis-smoothed); fedStreakMs accumulates
// while fed and resets to 0 on any starved tick — the indicator only clears once
// fedStreakMs crosses STARVATION_CLEAR_MS (core/economy.ts), preventing flicker at the
// supply boundary. Present on every building (not just consumers) for schema uniformity;
// unused/always-false for buildings with no `consumes` requirement.
export interface BuildingState {
  level: number;
  upgrades: string[];
  starvedIndicator: boolean;
  fedStreakMs: number;
}

// Contracts (full shape defined in Sprint 9 / core/contracts.ts). Placeholder kept
// structurally consistent with GameState now so schemaVersion 1 needs no migration.
export interface ContractOffer {
  id: string;
  tier: 0 | 1 | 2;
  client: string;
  offeredAt: number;
  deadlineMs: number;
}

export interface ActiveContract {
  offerId: string;
  acceptedAt: number;
  padId: PadId | null;
  fulfilled: boolean;
}

export interface ContractState {
  offers: ContractOffer[];
  active: ActiveContract[];
}

export interface TelemetryEvent {
  id: string;
  name: string;
  timestamp: number;
  props: Record<string, unknown>;
}

export interface GameState {
  schemaVersion: number;
  lastSeenAt: number;
  resources: Record<Exclude<ResourceId, 'hardware'>, ResourceState> & {
    hardware: HardwareState;
  };
  staff: StaffState;
  buildings: Record<BuildingId, BuildingState>;
  research: { completed: string[]; inProgress: Process | null };
  processes: Process[];
  modifiers: Modifier[];
  mission: MissionState;
  economyFlags: EconomyFlags;
  contracts: ContractState;
  records: string[];
  narrative: { seen: string[] };
  telemetry: TelemetryEvent[];
}
