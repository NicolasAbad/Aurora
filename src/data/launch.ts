// Shared launch-mechanic constants — apply to EVERY launch class (sondas, Aurora I, and
// future satellite contracts), not just one. Moved out of data/soundingRockets.ts in
// Sprint 7 once Aurora I needed the same numbers (data/soundingRockets.ts re-exports
// them for its existing imports).
const MIN = 60_000;

// GDD §7b failure resolution (general rule — ECONOMY §6's scripted-failure numbers for
// Probe-1 test 1 match this exactly: 6 of 10 H recovered = 60%, confirming the same rule
// applies program-wide).
export const FAILURE_HARDWARE_RECOVERY_RATE = 0.6;
export const FAILURE_XP_RATE = 0.8;
export const FAILURE_FLIGHT_DATA_RATE = 0.6;
export const FAILURE_REINTEGRATION_DURATION_RATE = 0.5;

// ECONOMY §5c v4.3 (Sprint 11.6): Propulsion research's "Engine doctrine" fork —
// Aggressive fuel mixture trades a WORSE failure outcome for cheaper Propellant every
// launch; Safety-margin mixture trades a BETTER failure outcome for costlier Propellant.
// A genuine mechanic-changing pair (not a flat percentage): it changes what a FAILURE
// means for the rest of the program, not just a launch-time cost. Centralized here
// (rather than duplicating a completedTech check at each of the 3 call sites) so
// auroraMission/contractMission/soundingMission all read the same real recovery rate a
// player is actually getting, never silently 3 slightly-different copies of this check.
const AGGRESSIVE_FUEL_MIXTURE_RECOVERY_RATE = 0.45;
const SAFETY_MARGIN_MIXTURE_RECOVERY_RATE = 0.75;
export function hardwareRecoveryRate(completedTech: string[]): number {
  if (completedTech.includes('aggressiveFuelMixture')) return AGGRESSIVE_FUEL_MIXTURE_RECOVERY_RATE;
  if (completedTech.includes('safetyMarginMixture')) return SAFETY_MARGIN_MIXTURE_RECOVERY_RATE;
  return FAILURE_HARDWARE_RECOVERY_RATE;
}

// ECONOMY §11: uniform 2-5 min (fixed 2 min with Weather Station — Tracking Station
// upgrade, buildable from Sprint 7; not yet applied here, v1 always uses the full range).
export const WEATHER_WINDOW_MIN_MS = 2 * MIN;
export const WEATHER_WINDOW_MAX_MS = 5 * MIN;
