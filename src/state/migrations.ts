// CLAUDE.md rule 5: every schema change ships a migration in the same commit.
// Registry maps a version N to the function that upgrades a raw save from N to N+1.
// Empty at schemaVersion 1 — nothing to migrate from yet.
export const CURRENT_SCHEMA_VERSION = 1;

export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {};

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
