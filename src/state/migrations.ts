// CLAUDE.md rule 5: every schema change ships a migration in the same commit.
// Registry maps a version N to the function that upgrades a raw save from N to N+1.
export const CURRENT_SCHEMA_VERSION = 2;

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

export const MIGRATIONS: Record<number, Migration> = {
  1: v1ToV2,
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
