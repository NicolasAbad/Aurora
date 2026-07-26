import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations';

describe('migrate — v1 to v2 (Sprint 3: starvation hysteresis state)', () => {
  it('adds starvedIndicator/fedStreakMs to every building in a v1 save', () => {
    const v1Save = {
      schemaVersion: 1,
      buildings: {
        finance: { level: 2, upgrades: [] },
        fabrication: { level: 1, upgrades: ['someUpgrade'] },
      },
    };

    const migrated = migrate(v1Save, 1) as {
      schemaVersion: number;
      buildings: Record<string, { level: number; upgrades: string[]; starvedIndicator: boolean; fedStreakMs: number }>;
    };

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.buildings.finance).toEqual({
      level: 2,
      upgrades: [],
      starvedIndicator: false,
      fedStreakMs: 0,
    });
    // Pre-existing fields (level, upgrades) are preserved, not reset.
    expect(migrated.buildings.fabrication.level).toBe(1);
    expect(migrated.buildings.fabrication.upgrades).toEqual(['someUpgrade']);
    expect(migrated.buildings.fabrication.starvedIndicator).toBe(false);
  });
});
