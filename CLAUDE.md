# CLAUDE.md — Aurora Program — Project instructions
*Lives at repo root. Claude Code reads this every session.*

## What this project is
**Aurora Program**: a long, finite, Kittens-Game-style incremental about building a space program. **Web first; Android + monetization are post-launch and have NO code in v1.** Source docs in `/docs`:
- `GDD.md` — full design (the authority on WHAT to build)
- `ECONOMY_MODEL.md` — ALL numbers (the authority on values)
- `SPRINTS.md` — step-by-step plan (the authority on ORDER and scope)
- `NARRATIVE_EVENTS.md` — all game text (English), referenced by ID
- `UI_SPEC.md` — screens, layout, states, visual direction

## Non-negotiable rules
1. **DO NOT INVENT.** If a number, text, mechanic or building is not in the docs: stop, ask, add it to the right doc BEFORE coding. Never "assume a reasonable value."
2. **No scope creep.** Nothing outside the GDD, nothing outside the current sprint. New ideas go to `docs/BACKLOG.md`, not into code. No monetization code of any kind in v1.
3. **Content = data, systems = pure functions.** All content (buildings, tech, narrative, contracts, events, records) lives in `/src/data` as typed objects. All logic lives in `/src/core` as pure functions with no React. UI only consumes the store.
4. **Centralized modifiers.** Every bonus (tech, internal upgrade, XP node, event outcome) registers in `core/modifiers.ts`; systems query them. Never hardcode a bonus inside a system. Event effects like E-04's salary premium are modifiers, never special-cased individuals.
5. **Versioned saves always.** A schema change that requires transforming existing data = migration written in the same commit, with a `schemaVersion` bump. A purely **additive optional field** (absent = the existing behavior, e.g. `expiresAt?`) needs neither a migration nor a bump — note it in PROGRESS.md instead of writing a no-op migration.
5b. **Docs can regress in transit.** The owner sometimes sends whole replacement files authored from their own copy, which can silently revert schema sections that were added in-repo during a sprint. Before applying a replacement doc, diff it against the repo version; if it DROPS anything the shipped code depends on, do not change code to match — flag it and keep the code. Shipped, tested behavior beats a doc line that looks like a transit error.
6. **Time by timestamp, never tick accumulation.** Processes store `startedAt + durationMs`, resolved against `Date.now()`. Offline reuses the exact same resolution logic as online.
7. **Tests for `/core`.** economy, time (incl. offline + insolvency), confidence, contracts have tests before UI integration. Offline math is the #1 idle-game bug source.
8. **Every sprint ends playable** with its SPRINTS.md acceptance criterion verified.
9. **Game text only from NARRATIVE_EVENTS.md**, referenced by ID (N-07, E-03, T-02…). No inline narrative strings in UI. English is the base language; the ID indirection keeps the game i18n-ready.
10. **Performance:** the tick updates the store once per frame; components use selectors — a tile must not re-render if its data didn't change.
11. **Dev tooling ships dev-only.** The time-warp multiplier (Sprint 2) and the headless simulator (`sim/run.ts`, Sprint 0) are excluded from production builds (env-gated). Telemetry buffer is always local-first; any remote endpoint is added only in Sprint 12 per SPRINTS.
12. **Committed randomness.** Any player-facing probabilistic outcome (launch roll) is drawn once, stored in the save at checklist completion, and resolved deterministically. Never roll at button press.

## Data schemas (initial source of truth)
```typescript
type ResourceId = 'funding'|'research'|'materials'|'hardware'|'propellant'|'reputation'|'flightxp';
// Staff is NOT a ResourceState — it is managed via StaffState below (GDD §1 note).
interface ResourceState { amount: number; cap: number | null; lifetimeEarned: number; }
// Rule (GDD §1c): one-time payments may push amount above cap; passive production halts while amount ≥ cap.

type HardwareTier = 'aluminum'|'titanium'; // 'composites' reserved for v2
interface HardwareState extends ResourceState {
  byTier: Record<HardwareTier, number>;    // invariant: sum(byTier) === amount; single shared cap
}
// Costs may demand a minimum tier: { resource: 'hardware', amount: 80, minTier: 'titanium' }

type RoleId = 'technician'|'engineer'|'scientist'|'controller';
interface StaffState {
  pools: Record<RoleId, { hired: number; assigned: Record<BuildingId, number> }>;
  astronauts: Astronaut[]; // empty in v1; schema fixed now to avoid migration
}
interface Astronaut { id: string; name: string; originRole: RoleId; skill: number;
  status: 'training'|'available'|'on_mission'; missionsFlown: number; }

interface BuildingDef { id: BuildingId; complex: 'campus'|'production'|'testing'|'launch';
  baseCost: Partial<Record<ResourceId, number>>; costFactor: number;
  production?: { resource: ResourceId; basePerSec: number; consumes?: Partial<Record<ResourceId, number>> };
  slots?: Partial<Record<RoleId, number>>; capBonus?: Partial<Record<ResourceId, number>>;
  staffCapBonus?: number; // Staff is not a ResourceId (see note above) — Crew Quarters uses this (+3/level); starting cap 2 (ECONOMY §1)
  teaser?: boolean; // UI_SPEC §2b: renders locked-with-condition before unlock (v1: Training Center only); default = hidden until unlocked
  internalUpgrades?: InternalUpgradeDef[]; unlockCondition: UnlockCondition; }

interface Process { id: string; kind: 'research'|'certification'|'integration'|'transfer'|
  'training'|'contract_build'|'weather_window'; startedAt: number; durationMs: number;
  payload: Record<string, unknown>; }

interface Modifier { id: string; source: string; target: string; // e.g. 'certification.duration'
  op: 'mult'|'add'; value: number;
  expiresAt?: number; // epoch ms; absent = permanent. Temporary modifiers (E-05's 2h process penalty)
  // are resolved by timestamp like every other time-based thing (rule 6) — never by tick countdown.
  // Expired modifiers are filtered at query time in core/modifiers.ts AND pruned on save/load and
  // offline resolution, so an offline gap can never leave a stale effect applied.
}

// Missions are PER PAD from schemaVersion 1 — Pad B (Sprint 9) must not require a migration.
type PadId = 'padA'|'padB';
interface PadMissionState {
  rocketStatus: 'none'|'integrating'|'in_vab'|'transferring'|'on_pad';
  stagesDone: string[]; checklist: Record<ChecklistItemId, boolean>;
  confidence: number;
  committedRoll: number | null; // drawn at checklist completion (rule 12); null until then
}
// ECONOMY §7a: sounding rockets launch from the Launch Rail (Complex C), not a pad.
type SoundingRocketId = 's1'|'s2';
type SoundingChecklistItemId = 'assembled'|'propellantReady'|'weatherWindow'|'flightReview'; // flightReview: S-2 only
interface SoundingMissionState {
  rocketId: SoundingRocketId; contractId: string | null; // tier-0 ContractOffer id, if linked
  checklist: Record<SoundingChecklistItemId, boolean>;
  confidence: number; // ECONOMY §7a simplified formula
  committedRoll: number | null; // drawn at checklist completion (rule 12); null until then
}
interface MissionState {
  pads: Partial<Record<PadId, PadMissionState>>; // v1 start: { padA: … }; padB added when built
  launches: LaunchRecord[];
  sounding: SoundingMissionState | null; // current sounding-rocket attempt; null = none in progress
  soundingHalfDurationNext: Partial<Record<SoundingRocketId, boolean>>; // GDD §7b re-integration bonus
}

interface EconomyFlags { payrollUnpaid: boolean; } // GDD §1b insolvency state, drives UI banner

// ECONOMY §6: only Probe-1 has certification content in v1 (Sprint 5); Orbital-1
// (Sprint 7) is listed now so `engines` never needs a migration later.
type EngineId = 'probe1'|'orbital1';
interface EngineCertificationState { attempted: boolean; certified: boolean; extendedCertified: boolean; }

interface BuildingState { level: number; upgrades: string[];
  starvedIndicator: boolean; // §4b: shown from the first starved tick
  fedStreakMs: number;       // §4b hysteresis: indicator clears after 3 consecutive fed ticks
}

interface GameState { schemaVersion: number; lastSeenAt: number;
  resources: Record<Exclude<ResourceId,'hardware'>, ResourceState> & { hardware: HardwareState };
  staff: StaffState;
  buildings: Record<BuildingId, BuildingState>;
  research: { completed: string[]; inProgress: Process | null };
  certifications: { engines: Record<EngineId, EngineCertificationState>; inProgress: Process | null };
  processes: Process[]; modifiers: Modifier[]; mission: MissionState;
  economyFlags: EconomyFlags;
  contracts: ContractState; records: string[]; narrative: { seen: string[] };
  telemetry: TelemetryEvent[]; }
```

## Per-sprint workflow
1. Read the current sprint in SPRINTS.md and its acceptance criteria
2. List tasks; confirm every needed value exists in ECONOMY_MODEL.md
3. Implement core → data → UI, core tests first
4. Run `sim/run.ts` when the sprint touches economy values; verify sanity rules still hold
5. Verify acceptance + save/load regression — **acceptance criteria are verified through the integrated path (real store, real resolution flow, end to end), never by isolated unit tests alone**: a unit-tested function nobody calls is not an accepted feature. For any sprint that touches UI, run a rendered smoke check (Playwright headless via the run skill's fallback — installed in the scratchpad, NEVER added as a project dependency) covering the sprint's new interactions, and screenshot-verify at least one multi-word/edge-case label
6. Commit per task; on sprint close, update `docs/PROGRESS.md` with status and deviations
