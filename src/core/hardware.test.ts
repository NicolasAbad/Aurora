import { describe, expect, it } from 'vitest';
import { creditHardware, currentHardwareTier, hardwareAtOrAboveTier, spendHardware } from './hardware';
import type { HardwareState } from './types';

function makeHardware(overrides: Partial<HardwareState> = {}): HardwareState {
  return { amount: 0, cap: 100, lifetimeEarned: 0, byTier: { aluminum: 0, titanium: 0 }, ...overrides };
}

describe('currentHardwareTier', () => {
  it('defaults to aluminum before Titanium is researched', () => {
    expect(currentHardwareTier([])).toBe('aluminum');
    expect(currentHardwareTier(['basicEngineering'])).toBe('aluminum');
  });

  it('switches to titanium once researched (GDD §1: "Fabrication produces at its current tier")', () => {
    expect(currentHardwareTier(['titanium'])).toBe('titanium');
  });
});

describe('creditHardware', () => {
  it('credits into the given tier while keeping amount in sync (sum(byTier) === amount)', () => {
    const result = creditHardware(makeHardware(), 10, 'aluminum');
    expect(result.amount).toBe(10);
    expect(result.byTier.aluminum).toBe(10);
    expect(result.byTier.aluminum + result.byTier.titanium).toBe(result.amount);
  });

  it('halts at the shared cap like any other passive production (GDD §1c)', () => {
    const result = creditHardware(makeHardware({ amount: 95, cap: 100 }), 10, 'aluminum');
    expect(result.amount).toBe(100);
    expect(result.byTier.aluminum).toBe(5); // only the room that actually fit
  });

  it('is a no-op for zero/negative amounts', () => {
    const hw = makeHardware({ amount: 5, byTier: { aluminum: 5, titanium: 0 } });
    expect(creditHardware(hw, 0, 'aluminum')).toBe(hw);
  });

  // Sprint 5: recovering Hardware from a failed certification test is a reward, not
  // passive production — GDD §1c's "one-time payments ignore caps" applies here too,
  // mirroring core/economy.ts's applyGrant.
  it('ignores the cap when oneTime is true', () => {
    const result = creditHardware(makeHardware({ amount: 95, cap: 100 }), 10, 'aluminum', true);
    expect(result.amount).toBe(105);
    expect(result.byTier.aluminum).toBe(10);
  });

  it('still halts at the cap by default (oneTime defaults to false)', () => {
    const result = creditHardware(makeHardware({ amount: 95, cap: 100 }), 10, 'aluminum');
    expect(result.amount).toBe(100);
  });
});

describe('hardwareAtOrAboveTier', () => {
  it('sums only tiers at or above the given one', () => {
    const hw = makeHardware({ amount: 30, byTier: { aluminum: 20, titanium: 10 } });
    expect(hardwareAtOrAboveTier(hw, 'aluminum')).toBe(30); // both tiers count
    expect(hardwareAtOrAboveTier(hw, 'titanium')).toBe(10); // aluminum doesn't satisfy a titanium minimum
  });
});

describe('spendHardware', () => {
  it('deducts from the lowest tier at/above minTier first, keeping sum(byTier) === amount', () => {
    const hw = makeHardware({ amount: 30, byTier: { aluminum: 20, titanium: 10 } });
    const result = spendHardware(hw, 15); // default minTier aluminum
    expect(result.amount).toBe(15);
    expect(result.byTier.aluminum).toBe(5); // 20 - 15
    expect(result.byTier.titanium).toBe(10); // untouched
    expect(result.byTier.aluminum + result.byTier.titanium).toBe(result.amount);
  });

  it('spends only from tiers at/above minTier when specified (a titanium-gated cost)', () => {
    const hw = makeHardware({ amount: 30, byTier: { aluminum: 20, titanium: 10 } });
    const result = spendHardware(hw, 8, 'titanium');
    expect(result.byTier.aluminum).toBe(20); // untouched — cost required titanium specifically
    expect(result.byTier.titanium).toBe(2);
    expect(result.amount).toBe(22);
  });

  it('spills over into the next tier when the first tier at/above minTier is not enough', () => {
    const hw = makeHardware({ amount: 12, byTier: { aluminum: 10, titanium: 2 } });
    const result = spendHardware(hw, 12);
    expect(result.byTier.aluminum).toBe(0);
    expect(result.byTier.titanium).toBe(0);
    expect(result.amount).toBe(0);
  });
});
