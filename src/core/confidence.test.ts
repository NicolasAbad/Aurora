import { describe, expect, it } from 'vitest';
import { computeConfidenceBreakdown } from './confidence';
import type { EngineCertificationState } from './types';

function engineState(overrides: Partial<EngineCertificationState> = {}): EngineCertificationState {
  return { attempted: false, certified: false, extendedCertified: false, ...overrides };
}

function baseInputs() {
  return {
    engineState: engineState(),
    flightReviewApproved: false,
    controllersFullyStaffed: false,
    serviceTowerBuilt: false,
    weatherResolved: false,
    flightXp: 0,
  };
}

describe('computeConfidenceBreakdown', () => {
  it('base only: 40, nothing else contributes', () => {
    const result = computeConfidenceBreakdown(baseInputs());
    expect(result).toEqual({ base: 40, certification: 0, flightReview: 0, controllers: 0, serviceTower: 0, weather: 0, experience: 0, total: 40 });
  });

  it('standard certification adds 20, extended adds 30', () => {
    expect(computeConfidenceBreakdown({ ...baseInputs(), engineState: engineState({ certified: true } ) }).certification).toBe(20);
    expect(
      computeConfidenceBreakdown({ ...baseInputs(), engineState: engineState({ certified: true, extendedCertified: true }) })
        .certification,
    ).toBe(30);
  });

  it('with extended certification, the deterministic terms alone reach exactly 100 — no Service Tower, no XP needed (GDD §7b)', () => {
    const result = computeConfidenceBreakdown({
      engineState: engineState({ certified: true, extendedCertified: true }),
      flightReviewApproved: true,
      controllersFullyStaffed: true,
      serviceTowerBuilt: false,
      weatherResolved: true,
      flightXp: 0,
    });
    expect(result.total).toBe(100);
  });

  it('Flight Experience bonus is +1 per 50 XP, capped at +15', () => {
    expect(computeConfidenceBreakdown({ ...baseInputs(), flightXp: 0 }).experience).toBe(0);
    expect(computeConfidenceBreakdown({ ...baseInputs(), flightXp: 149 }).experience).toBe(2);
    expect(computeConfidenceBreakdown({ ...baseInputs(), flightXp: 150 }).experience).toBe(3);
    expect(computeConfidenceBreakdown({ ...baseInputs(), flightXp: 10_000 }).experience).toBe(15); // capped
  });

  it('total is capped at 100 even when every term is maxed plus a large XP bonus', () => {
    const result = computeConfidenceBreakdown({
      engineState: engineState({ certified: true, extendedCertified: true }),
      flightReviewApproved: true,
      controllersFullyStaffed: true,
      serviceTowerBuilt: true,
      weatherResolved: true,
      flightXp: 10_000,
    });
    // 40+30+15+10+5+5+15 = 120, capped
    expect(result.total).toBe(100);
  });

  it('every checklist-tied term is 0 while its item is still pending (the live-preview case)', () => {
    const result = computeConfidenceBreakdown({
      ...baseInputs(),
      engineState: engineState({ certified: true }),
    });
    expect(result.flightReview).toBe(0);
    expect(result.controllers).toBe(0);
    expect(result.weather).toBe(0);
    expect(result.total).toBe(60); // 40 base + 20 cert
  });
});
