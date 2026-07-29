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
  // rule 9: the actual player-facing text lives in NARRATIVE_EVENTS.md §6 (U-01..U-09),
  // resolved via data/narrative.ts's NARRATIVE_TEXT — this is the ID, never the string.
  narrativeId: string;
}

export interface BuildingDef {
  id: BuildingId;
  name: string; // display label, GDD §3's canonical building names
  complex: ComplexId;
  baseCost: Partial<Record<ResourceId, number>>;
  costFactor: number | null; // null => one-time (non-leveled) building
  // UI_SPEC §4: "nothing purchasable... may be offered without plain-language copy
  // stating its effect." Plain mechanical fact transcribed from ECONOMY §4's Effect
  // column (same "plain data field, not narrative-ID-routed" pattern as
  // ResearchNode.description) — buildings that also have `production` show a live
  // computed rate line instead/as well; this covers the ones that don't.
  description: string;
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
  // epoch ms; absent = permanent. Temporary modifiers (E-05's 2h process-duration
  // penalty, Sprint 9) are resolved by timestamp like every other time-based thing
  // (rule 6) — never by tick countdown. Expired modifiers are filtered at query time
  // (core/modifiers.ts's applyModifiers) AND pruned on save/load and offline
  // resolution (pruneExpiredModifiers), so an offline gap can never leave a stale
  // effect applied.
  expiresAt?: number;
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
  // ECONOMY §10 v3.6 (Sprint 9): which satellite-contract offer (ContractOffer.id) this
  // pad's current mission is fulfilling. Additive optional (rule 5) — absent/null means
  // an Aurora-I-class story mission (core/auroraMission.ts), the pre-Sprint-9 default.
  // Set when core/contractMission.ts starts a payload integration on this pad, cleared
  // when that mission resolves (success or failure) — a pad can only ever host one
  // mission (story or contract) at a time, which IS the "pad-queue tension" SPRINTS.md's
  // acceptance criterion refers to. Aurora's own pad functions skip any pad with this set
  // (see their own guards); contractMission.ts's functions only ever touch pads with it set.
  contractId?: string | null;
}

export interface LaunchRecord {
  id: string;
  // Sounding rockets (S-1/S-2) launch from the Launch Rail (Complex C), not a Complex D
  // pad — null for those; ActiveContract.padId below already established this same
  // "no pad involved yet" nullability for tier-0 contracts, same reasoning here.
  padId: PadId | null;
  missionType: 'staticFireTest' | 's1' | 's2' | 'auroraI' | 'auroraII' | 'contract';
  success: boolean;
  timestamp: number;
  contractId?: string; // ContractOffer id this flight fulfilled, if any (additive, rule 5)
}

// ECONOMY §7a: sounding rockets, the pre-orbital launch loop (GDD §6b's rung 1-2). Closed
// union, not open-ended — v1 only ever adds these two (same "every named variant up
// front" precedent as EngineId/PadId, so a later addition never needs a migration).
export type SoundingRocketId = 's1' | 's2';

// Real-time checklist items — "the full launch loop in miniature" (SPRINTS Sprint 6),
// simplified from PadMissionState's 8-item ChecklistItemId. 'flightReview' only applies
// to S-2 ("Same + flight review (20 R)", ECONOMY §7a) — present-but-unused for an S-1
// mission, same "uniform shape, some fields inert for some variants" pattern as
// BuildingState.starvedIndicator on non-consumer buildings.
export type SoundingChecklistItemId =
  | 'assembled'
  | 'propellantReady'
  | 'weatherWindow'
  | 'flightReview';

export interface SoundingMissionState {
  rocketId: SoundingRocketId;
  contractId: string | null; // tier-0 ContractOffer id this flight fulfills, if linked (ECONOMY §10)
  checklist: Record<SoundingChecklistItemId, boolean>;
  confidence: number; // ECONOMY §7a simplified formula; live-recomputed until committedRoll is drawn
  committedRoll: number | null; // drawn the instant the checklist completes (rule 12); null until then
}

export interface MissionState {
  pads: Partial<Record<PadId, PadMissionState>>; // v1 start: { padA: … }; padB added when built
  launches: LaunchRecord[];
  sounding: SoundingMissionState | null; // current sounding-rocket attempt; null = none in progress
  // GDD §7b: a failed launch's next re-assembly of the SAME rocket type runs at 50%
  // duration ("re-integration"). Persists across the mission-slot reset that happens on
  // resolution (`sounding` above goes back to null); consumed the next time that rocket
  // type starts a fresh assembly (core/soundingMission.ts).
  soundingHalfDurationNext: Partial<Record<SoundingRocketId, boolean>>;
  // GDD §7b: same re-integration bonus as soundingHalfDurationNext above, but for a
  // failed Aurora-I-class launch on a given pad (Sprint 7). Additive optional field
  // (CLAUDE.md rule 5) — absent means no pad has ever failed, no migration needed;
  // read as `mission.auroraHalfDurationNext?.[padId] ?? false`.
  auroraHalfDurationNext?: Partial<Record<PadId, boolean>>;
  // NARRATIVE §3 E-03 option B ("Use it anyway"): -10 Confidence on the NEXT mission's
  // checklist resolution, any mission kind (sounding/Aurora/contract — whichever commits
  // a roll next). Additive optional (rule 5). Doesn't fit core/modifiers.ts's shape
  // (permanent or time-expiring, never "consumed on first use"), so it's a one-shot flag
  // living here instead, mirroring soundingHalfDurationNext/auroraHalfDurationNext's own
  // "pending effect for the next mission" pattern. Applied and cleared at the moment a
  // checklist's committedRoll is drawn (core/soundingMission.ts, core/auroraMission.ts,
  // core/contractMission.ts) — never redrawn or reapplied after that.
  confidencePenaltyNext?: number;
}

export interface EconomyFlags {
  payrollUnpaid: boolean; // GDD §1b insolvency state, drives UI banner
}

// ECONOMY §6: only Probe-1 has certification content in v1 (Sprint 5); Orbital-1 is
// Sprint 7 (Aurora I). Listed now so `engines` never needs a migration when Orbital-1's
// certification lands — same "closed union covers every named future event" precedent
// as PadId/HardwareTier.
export type EngineId = 'probe1' | 'orbital1';

// Generic flags, not Probe-1-specific: `attempted` covers both Probe-1's scripted-failure
// test 1 AND (Sprint 7) Orbital-1's probabilistic base-cert attempt, since both gate a
// "retry" the same way. `certified`/`extendedCertified` are self-explanatory (ECONOMY §6:
// every engine gets an optional extended pass once certified).
export interface EngineCertificationState {
  attempted: boolean;
  certified: boolean;
  extendedCertified: boolean;
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
  // Set once, the moment the −15 Reputation missed-deadline penalty (ECONOMY §10) is
  // applied, so a tick-driven check never re-penalizes the same contract twice. Additive
  // optional field (rule 5) — absent on any contract accepted before this existed.
  deadlineMissed?: boolean;
}

export interface ContractState {
  offers: ContractOffer[];
  active: ActiveContract[];
}

// ECONOMY §8b: auto-awarded once each, by event (never by launch number). `records:
// string[]` on GameState stays generic (RecordId values pushed into it), matching
// `research.completed`'s own "string[] of ids" shape rather than a dedicated array type.
export type RecordId =
  | 'firstIgnition'
  | 'firstFlight'
  | 'pastKarman'
  | 'firstOrbit'
  | 'firstCustomer'
  | 'firstDelivery';

export interface TelemetryEvent {
  id: string;
  name: string;
  timestamp: number;
  props: Record<string, unknown>;
}

// NARRATIVE §3 / ECONOMY §11 (Sprint 9): random events. "15% check per 10 active min,
// >=30 min apart, never during countdown" — `activeMsAccumulated` only advances during
// ONLINE ticks (never offline resolution: a 2-option card popping up unattended makes no
// sense, and NARRATIVE's "events wait as a pending card, never block play" implies a
// player has to be there to see one appear). `pending` holds at most one event awaiting a
// choice; a second 10-min window rolling while one is already pending is a no-op (the
// card must resolve, or keep waiting, before another can appear) — same "one thing at a
// time" precedent as research/certification's single in-progress slot.
export interface PendingEventState {
  id: string; // matches an EventDef id in data/events.ts (E-01..E-06)
  triggeredAt: number;
}

export interface EventsState {
  activeMsAccumulated: number;
  lastEventAt: number | null;
  pending: PendingEventState | null;
}

export interface GameState {
  schemaVersion: number;
  lastSeenAt: number;
  // UI_SPEC §2d: Campus staged reveal — Crew Quarters/R&D Lab appear the first time the
  // staff pool reaches its cap, and (unlike the funding/building-level reveal steps,
  // which are naturally monotonic) must STAY revealed even if staff dismissal (§4b)
  // later drops the pool back under cap. Additive optional field (rule 5, no migration);
  // absent/false is live-OR'd with "already built" at the UI layer so no pre-existing
  // save regresses (see App.tsx's CampusPanel).
  staffCapReachedOnce?: boolean;
  resources: Record<Exclude<ResourceId, 'hardware'>, ResourceState> & {
    hardware: HardwareState;
  };
  staff: StaffState;
  buildings: Record<BuildingId, BuildingState>;
  // secondInProgress (ECONOMY §4 v3.6, R&D Lab's "Second research track" upgrade):
  // additive optional (CLAUDE.md rule 5) — absent/undefined means exactly the pre-v3.6
  // single-track behavior, no migration needed.
  research: { completed: string[]; inProgress: Process | null; secondInProgress?: Process | null };
  // Sprint 5 (ECONOMY §6): same shape as `research` above — one test in progress at a
  // time, permanent per-engine progress that survives save/load.
  certifications: { engines: Record<EngineId, EngineCertificationState>; inProgress: Process | null };
  processes: Process[];
  modifiers: Modifier[];
  mission: MissionState;
  economyFlags: EconomyFlags;
  contracts: ContractState;
  records: string[];
  // `seen` stays the append-only dedup/gate array it always was. `log` (Sprint 9.5,
  // additive optional — rule 5, no migration) is the Mission Log's derived DISPLAY feed:
  // narrative beats and generic process completions (T-18/19/20) in true chronological
  // order — see data/narrative.ts's missionLogBase/syncSeenIntoLog for how it's kept in
  // sync with `seen` without touching any of the many markSeen call sites across core/.
  narrative: { seen: string[]; log?: string[] };
  telemetry: TelemetryEvent[];
  // Sprint 9, additive optional (rule 5): absent means never checked/no pending event —
  // read as `state.events ?? { activeMsAccumulated: 0, lastEventAt: null, pending: null }`
  // at every call site (core/events.ts exports the same default).
  events?: EventsState;
}
