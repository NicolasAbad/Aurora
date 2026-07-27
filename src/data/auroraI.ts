// ECONOMY_MODEL.md §7 (v2.2 durations) + §8 (v2.5 reward). Do not edit numbers here
// without editing them there first (CLAUDE.md rule 1). Matches sim/run.ts's own
// AURORA_I_STAGES table (built ahead of this sprint) exactly — see sim/run.ts's import.
import type { ResourceId } from '../core/types';

const MIN = 60_000;

export type AuroraStageId =
  | 'structure'
  | 'engines'
  | 'guidance'
  | 'satellitePayload'
  | 'finalIntegration'
  | 'padTransfer'
  | 'propellantLoad'
  | 'flightReview';

export interface AuroraStageDef {
  id: AuroraStageId;
  name: string;
  cost: Partial<Record<ResourceId, number>>;
  durationMs: number;
}

// GDD §7: one strict sequential chain (no vabQueues tech: player triggers each stage
// manually; with it, core/auroraMission.ts auto-starts the next the moment one finishes).
export const AURORA_I_STAGES: AuroraStageDef[] = [
  { id: 'structure', name: 'Structure', cost: { hardware: 30 }, durationMs: 20 * MIN },
  // ECONOMY §7: "Engines (Orbital-1 certified)" — this specific stage additionally
  // requires certifications.engines.orbital1.certified, checked in core/auroraMission.ts
  // (not expressible as a plain resource cost).
  { id: 'engines', name: 'Engines', cost: { hardware: 20 }, durationMs: 15 * MIN },
  { id: 'guidance', name: 'Guidance', cost: { hardware: 15, research: 30 }, durationMs: 15 * MIN },
  // "Satellite payload... (Payload Processing not required for own satellite)".
  { id: 'satellitePayload', name: 'Satellite payload', cost: { hardware: 15 }, durationMs: 15 * MIN },
  { id: 'finalIntegration', name: 'Final integration', cost: { hardware: 10 }, durationMs: 10 * MIN },
  { id: 'padTransfer', name: 'Pad transfer', cost: {}, durationMs: 5 * MIN },
  // Requires Propellant Depot lv2 (cap 500) to hold 400P — surfaced via tooltip T-08
  // (Sprint 8's FTUE system; not built yet, out of this sprint's scope).
  { id: 'propellantLoad', name: 'Propellant load', cost: { propellant: 400 }, durationMs: 3 * MIN },
  // "Flight review 50 R, instant (pure Research spend, no timer)" — 0 duration, same
  // instant-spend pattern as the sounding rockets' own flight review (Sprint 6).
  { id: 'flightReview', name: 'Flight review', cost: { research: 50 }, durationMs: 0 },
];

export const AURORA_I_STAGES_BY_ID: Map<AuroraStageId, AuroraStageDef> = new Map(
  AURORA_I_STAGES.map((s) => [s.id, s]),
);

// The 5 VAB integration sub-stages that collectively satisfy the "Rocket integrated"
// checklist item (GDD §7). The remaining 3 stages each map 1:1 to their own checklist
// item (transferToPad/propellantLoaded/flightReview) — see core/auroraMission.ts.
export const VAB_STAGE_IDS: AuroraStageId[] = [
  'structure',
  'engines',
  'guidance',
  'satellitePayload',
  'finalIntegration',
];

// ECONOMY §8 v2.5: "Aurora I (first satellite)".
export const AURORA_I_REWARD = { flightxp: 250, reputation: 60, flightData: 2000 };
