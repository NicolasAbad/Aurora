// CLAUDE.md rule 5: every schema change ships a migration in the same commit.
// Registry maps a version N to the function that upgrades a raw save from N to N+1.
export const CURRENT_SCHEMA_VERSION = 4;

export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** v1 -> v2 (Sprint 3, ECONOMY §4b): buildings gain starvedIndicator/fedStreakMs for
 * the input-starvation hysteresis indicator. Every pre-existing building starts fed. */
function v1ToV2(state: Record<string, unknown>): Record<string, unknown> {
  const buildings = (state.buildings ?? {}) as Record<string, Record<string, unknown>>;
  const migratedBuildings = Object.fromEntries(
    Object.entries(buildings).map(([id, b]) => [
      id,
      { ...b, starvedIndicator: false, fedStreakMs: 0 },
    ]),
  );
  return { ...state, schemaVersion: 2, buildings: migratedBuildings };
}

/** v2 -> v3 (Sprint 5, ECONOMY §6): new top-level `certifications` slot, same shape as
 * `research` (one test in progress, permanent per-engine progress). A pre-existing save
 * has certified nothing yet — every engine starts at all-false, nothing in progress. */
function v2ToV3(state: Record<string, unknown>): Record<string, unknown> {
  return {
    ...state,
    schemaVersion: 3,
    certifications: {
      engines: {
        probe1: { attempted: false, certified: false, extendedCertified: false },
        orbital1: { attempted: false, certified: false, extendedCertified: false },
      },
      inProgress: null,
    },
  };
}

/** v3 -> v4 (Sprint 6, ECONOMY §7a): new `mission.sounding` slot (current sounding-rocket
 * attempt, null = none in progress) and `mission.soundingHalfDurationNext` (GDD §7b
 * re-integration bonus tracker). A pre-existing save has no mission in flight and no
 * pending re-integration bonus for either rocket type. */
function v3ToV4(state: Record<string, unknown>): Record<string, unknown> {
  const mission = (state.mission ?? {}) as Record<string, unknown>;
  return {
    ...state,
    schemaVersion: 4,
    mission: { ...mission, sounding: null, soundingHalfDurationNext: {} },
  };
}

export const MIGRATIONS: Record<number, Migration> = {
  1: v1ToV2,
  2: v2ToV3,
  3: v3ToV4,
};

export function migrate(
  rawState: Record<string, unknown>,
  fromVersion: number,
): Record<string, unknown> {
  let state = rawState;
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) {
      throw new Error(`No migration registered from schemaVersion ${v} to ${v + 1}`);
    }
    state = step(state);
  }
  return state;
}
