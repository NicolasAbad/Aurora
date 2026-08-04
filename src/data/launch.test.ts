import { describe, expect, it } from 'vitest';
import { FAILURE_HARDWARE_RECOVERY_RATE, hardwareRecoveryRate } from './launch';

// ECONOMY §5c v4.3 (Sprint 11.6): Propulsion research's "Engine doctrine" fork —
// centralized here so auroraMission/contractMission/soundingMission all read the same
// real recovery rate a player is actually getting.
describe('hardwareRecoveryRate (ECONOMY §5c v4.3, Sprint 11.6)', () => {
  it('returns the standard 60% rate with neither fork node researched', () => {
    expect(hardwareRecoveryRate([])).toBe(FAILURE_HARDWARE_RECOVERY_RATE);
    expect(hardwareRecoveryRate(['aluminum', 'titanium'])).toBe(FAILURE_HARDWARE_RECOVERY_RATE);
  });

  it('returns a WORSE (lower) rate with Aggressive fuel mixture researched', () => {
    const rate = hardwareRecoveryRate(['aggressiveFuelMixture']);
    expect(rate).toBeLessThan(FAILURE_HARDWARE_RECOVERY_RATE);
  });

  it('returns a BETTER (higher) rate with Safety-margin mixture researched', () => {
    const rate = hardwareRecoveryRate(['safetyMarginMixture']);
    expect(rate).toBeGreaterThan(FAILURE_HARDWARE_RECOVERY_RATE);
  });

  it('the two fork rates are never simultaneously true in practice (excludes each other), but if they were, aggressive is checked first', () => {
    expect(hardwareRecoveryRate(['aggressiveFuelMixture', 'safetyMarginMixture'])).toBeLessThan(
      FAILURE_HARDWARE_RECOVERY_RATE,
    );
  });
});
