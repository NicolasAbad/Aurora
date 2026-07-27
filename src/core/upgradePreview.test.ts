import { describe, expect, it } from 'vitest';
import { upgradeDeltaPreview } from './upgradePreview';

describe('upgradeDeltaPreview — UI_SPEC §4 v3.5 clarity rule', () => {
  it('production buildings preview the rate delta (Finance)', () => {
    const text = upgradeDeltaPreview('finance', 1, 1);
    expect(text).toContain('Level 2');
    expect(text).toContain('Funding');
  });

  it('capBonus buildings preview the cap delta (Warehouse)', () => {
    const text = upgradeDeltaPreview('warehouse', 0, 1);
    expect(text).toContain('+500 Funding cap');
    expect(text).toContain('+300 Materials cap');
    expect(text).toContain('+75 Hardware cap');
  });

  it('staffCapBonus buildings preview the staff cap delta (Crew Quarters)', () => {
    expect(upgradeDeltaPreview('crewQuarters', 0, 1)).toBe('Level 1 → +3 staff cap');
  });

  it('Test Stand previews its new per-level certification-duration effect', () => {
    const atZero = upgradeDeltaPreview('testStand', 0, 1);
    expect(atZero).toContain('enables certifications');
    const atFour = upgradeDeltaPreview('testStand', 4, 1);
    expect(atFour).toBe('Level 5 → -12% certification duration (currently -9%)');
  });

  it('buildings with no wired numeric effect return null, not an invented claim', () => {
    expect(upgradeDeltaPreview('vab', 1, 1)).toBeNull();
    expect(upgradeDeltaPreview('trackingStation', 1, 1)).toBeNull();
  });
});
