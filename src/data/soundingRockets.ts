// ECONOMY_MODEL.md §7a (v2.5). Do not edit numbers here without editing them there first
// (CLAUDE.md rule 1). Weather window duration is uniform 2-5 min per §11 — drawn at
// random in core/soundingMission.ts, not a fixed value here.
import type { SoundingRocketId } from '../core/types';

const MIN = 60_000;

export interface SoundingRocketDef {
  id: SoundingRocketId;
  name: string;
  assemblyHardware: number;
  assemblyDurationMs: number;
  launchPropellant: number;
  requiresExtendedRail: boolean;
  flightReviewCostResearch?: number; // §7: "Same + flight review (20 R)" — S-2 only
  successReward: { flightxp: number; reputation: number; flightData: number };
  narrativeIdOnSuccess: string; // NARRATIVE §1
}

export const SOUNDING_ROCKETS: Record<SoundingRocketId, SoundingRocketDef> = {
  s1: {
    id: 's1',
    name: 'S-1 sounding rocket',
    assemblyHardware: 8,
    assemblyDurationMs: 10 * MIN,
    launchPropellant: 30,
    requiresExtendedRail: false,
    successReward: { flightxp: 15, reputation: 1, flightData: 200 },
    narrativeIdOnSuccess: 'N-08b',
  },
  s2: {
    id: 's2',
    name: 'S-2 high-altitude',
    assemblyHardware: 20,
    assemblyDurationMs: 25 * MIN,
    launchPropellant: 80,
    requiresExtendedRail: true,
    flightReviewCostResearch: 20,
    successReward: { flightxp: 50, reputation: 10, flightData: 1000 },
    narrativeIdOnSuccess: 'N-08c',
  },
};

// ECONOMY §11: uniform 2-5 min (fixed 2 min with Weather Station — Tracking Station
// upgrade, Sprint 7+; not reachable in Sprint 6, so always the uniform range for now).
export const WEATHER_WINDOW_MIN_MS = 2 * MIN;
export const WEATHER_WINDOW_MAX_MS = 5 * MIN;

// GDD §7b failure resolution (general rule, reused here — ECONOMY §6's scripted-failure
// numbers for Probe-1 test 1 match this exactly: 6 of 10 H recovered = 60%, confirming
// the same rule applies program-wide, not just to Aurora I).
export const FAILURE_HARDWARE_RECOVERY_RATE = 0.6;
export const FAILURE_XP_RATE = 0.8;
export const FAILURE_FLIGHT_DATA_RATE = 0.6;
export const FAILURE_REINTEGRATION_DURATION_RATE = 0.5;

// ECONOMY §7a simplified Sonda Confidence: base 65 + certification (+20 / +30 extended)
// + optimal weather (+5, unconditional — v1 has no variable weather quality, BACKLOG.md's
// "Dynamic weather with forecast" is explicitly v2). Weather is one of the mandatory
// checklist items, so it's always +5 once checklist completion is reached — there is no
// "launch before the window resolves" shortcut for sondas, unlike the full formula's
// generic "+5 / 0 if launched early" phrasing (§7b describes the FULL 8-item checklist,
// where weather is the last of several independently-timed items).
export const SONDA_CONFIDENCE_BASE = 65;
export const SONDA_CONFIDENCE_CERTIFIED = 20;
export const SONDA_CONFIDENCE_EXTENDED_CERTIFIED = 30;
export const SONDA_CONFIDENCE_WEATHER = 5;
