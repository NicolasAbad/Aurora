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

describe('migrate — v2 to v3 (Sprint 5: certification state)', () => {
  it('adds an all-false certifications slot to a v2 save, certifying nothing retroactively', () => {
    const v2Save = { schemaVersion: 2, resources: { funding: { amount: 42 } } };

    const migrated = migrate(v2Save, 2) as {
      schemaVersion: number;
      resources: { funding: { amount: number } };
      certifications: {
        engines: Record<string, { attempted: boolean; certified: boolean; extendedCertified: boolean }>;
        inProgress: null;
      };
    };

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.certifications).toEqual({
      engines: {
        probe1: { attempted: false, certified: false, extendedCertified: false },
        orbital1: { attempted: false, certified: false, extendedCertified: false },
      },
      inProgress: null,
    });
    // Pre-existing fields untouched.
    expect(migrated.resources.funding.amount).toBe(42);
  });

  it('walking from v1 also lands on the current version with every migration applied', () => {
    const v1Save = { schemaVersion: 1, buildings: { finance: { level: 1, upgrades: [] } } };
    const migrated = migrate(v1Save, 1) as { schemaVersion: number; certifications: unknown };
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.certifications).not.toBeUndefined();
  });
});

describe('migrate — v3 to v4 (Sprint 6: sounding-mission state)', () => {
  it('adds an idle sounding slot to a v3 save, nothing in flight retroactively', () => {
    const v3Save = {
      schemaVersion: 3,
      mission: { pads: {}, launches: [{ id: 'existing-launch' }] },
    };

    const migrated = migrate(v3Save, 3) as {
      schemaVersion: number;
      mission: {
        pads: unknown;
        launches: unknown[];
        sounding: unknown;
        soundingHalfDurationNext: Record<string, boolean>;
      };
    };

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.mission.sounding).toBeNull();
    expect(migrated.mission.soundingHalfDurationNext).toEqual({});
    // Pre-existing fields untouched.
    expect(migrated.mission.launches).toEqual([{ id: 'existing-launch' }]);
  });

  it('walking from v1 also lands on the current version with every migration applied', () => {
    const v1Save = { schemaVersion: 1, buildings: { finance: { level: 1, upgrades: [] } } };
    const migrated = migrate(v1Save, 1) as { schemaVersion: number; mission: { sounding: unknown } };
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.mission.sounding).toBeNull();
  });
});
