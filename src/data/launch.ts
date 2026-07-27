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

// ECONOMY §11: uniform 2-5 min (fixed 2 min with Weather Station — Tracking Station
// upgrade, buildable from Sprint 7; not yet applied here, v1 always uses the full range).
export const WEATHER_WINDOW_MIN_MS = 2 * MIN;
export const WEATHER_WINDOW_MAX_MS = 5 * MIN;
