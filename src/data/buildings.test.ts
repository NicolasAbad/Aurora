import { describe, expect, it } from 'vitest';
import { BUILDINGS } from './buildings';
import { NARRATIVE_TEXT } from './narrative';

// ECONOMY §4 (upgrade audit): "v2-only upgrades (Sound Suppression, Cryogenic Stand,
// Heavy Crane) are NOT rendered in v1 at all — not greyed, not teased." Checked
// structurally (they're simply absent from the data) rather than only visually via
// Playwright, since a missing entry can never accidentally render regardless of what
// any future UI change does — a stronger guarantee than "wasn't observed this run".
describe('BUILDINGS — v2-only internal upgrades are absent, not just hidden', () => {
  const V2_ONLY_IDS = ['soundSuppression', 'cryogenicStand', 'heavyCrane'];

  it('no building declares a v2-only upgrade id', () => {
    const allUpgradeIds = Object.values(BUILDINGS).flatMap((def) => def.internalUpgrades?.map((u) => u.id) ?? []);
    for (const v2Id of V2_ONLY_IDS) {
      expect(allUpgradeIds).not.toContain(v2Id);
    }
  });

  it('Tracking Station has no Radar upgrade — Radar is part of the base building', () => {
    const trackingUpgradeIds = BUILDINGS.trackingStation.internalUpgrades?.map((u) => u.id) ?? [];
    expect(trackingUpgradeIds).not.toContain('radar');
  });

  it('every internal upgrade has a narrativeId resolving to real text (NARRATIVE §6)', () => {
    const allUpgrades = Object.values(BUILDINGS).flatMap((def) => def.internalUpgrades ?? []);
    expect(allUpgrades.length).toBeGreaterThan(0);
    for (const upgrade of allUpgrades) {
      expect(upgrade.narrativeId).toMatch(/^U-\d{2}$/);
      expect(NARRATIVE_TEXT[upgrade.narrativeId]).toBeTruthy();
    }
  });

  it('every building has non-empty player-facing description text', () => {
    for (const def of Object.values(BUILDINGS)) {
      expect(def.description.length).toBeGreaterThan(0);
    }
  });
});
