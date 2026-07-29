# CLAUDE.md — Aurora Program — Project instructions
*Lives at repo root. Claude Code reads this every session.*

## What this project is
**Aurora Program**: a long, finite, Kittens-Game-style incremental about building a space program. **Web first; Android + monetization are post-launch and have NO code in v1.** Source docs in `/docs`:
- `GDD.md` — full design (the authority on WHAT to build)
- `ECONOMY_MODEL.md` — ALL numbers (the authority on values)
- `SPRINTS.md` — step-by-step plan (the authority on ORDER and scope)
- `NARRATIVE_EVENTS.md` — all game text (English), referenced by ID
- `UI_SPEC.md` — screens, layout, states, visual direction

## Non-negotiable rules
1. **DO NOT INVENT.** If a number, text, mechanic or building is not in the docs: stop, ask, add it to the right doc BEFORE coding. Never "assume a reasonable value."
2. **No scope creep.** Nothing outside the GDD, nothing outside the current sprint. New ideas go to `docs/BACKLOG.md`, not into code. No monetization code of any kind in v1.
3. **Content = data, systems = pure functions.** All content (buildings, tech, narrative, contracts, events, records) lives in `/src/data` as typed objects. All logic lives in `/src/core` as pure functions with no React. UI only consumes the store.
4. **Centralized modifiers.** Every bonus (tech, internal upgrade, XP node, event outcome) registers in `core/modifiers.ts`; systems query them. Never hardcode a bonus inside a system. Event effects like E-04's salary premium are modifiers, never special-cased individuals.
5. **Versioned saves always.** A schema change that requires transforming existing data = migration written in the same commit, with a `schemaVersion` bump. A purely **additive optional field** (absent = the existing behavior, e.g. `expiresAt?`) needs neither a migration nor a bump — note it in PROGRESS.md instead of writing a no-op migration.
5b. **Docs can regress in transit.** The owner sometimes sends whole replacement files authored from their own copy, which can silently revert schema sections that were added in-repo during a sprint. Before applying a replacement doc, diff it against the repo version; if it DROPS anything the shipped code depends on, do not change code to match — flag it and keep the code. Shipped, tested behavior beats a doc line that looks like a transit error.
6. **Time by timestamp, never tick accumulation.** Processes store `startedAt + durationMs`, resolved against `Date.now()`. Offline reuses the exact same resolution logic as online.
7. **Tests for `/core`.** economy, time (incl. offline + insolvency), confidence, contracts have tests before UI integration. Offline math is the #1 idle-game bug source.
8. **Every sprint ends playable** with its SPRINTS.md acceptance criterion verified.
9. **Game text only from NARRATIVE_EVENTS.md**, referenced by ID (N-07, E-03, T-02…). No inline narrative strings in UI. English is the base language; the ID indirection keeps the game i18n-ready.
10. **Performance:** the tick updates the store once per frame; components use selectors — a tile must not re-render if its data didn't change.
11. **Dev tooling ships dev-only.** The time-warp multiplier (Sprint 2) and the headless simulator (`sim/run.ts`, Sprint 0) are excluded from production builds (env-gated). Telemetry buffer is always local-first; any remote endpoint is added only in Sprint 12 per SPRINTS.
12. **Committed randomness.** Any player-facing probabilistic outcome (launch roll) is drawn once, stored in the save at checklist completion, and resolved deterministically. Never roll at button press.

## Data schemas — SOLE source of truth is `src/core/types.ts`, read it there
This file used to hand-duplicate the schema in a TypeScript block. That duplicate went stale twice (missed `EngineId`/`EngineCertificationState`/`SoundingMissionState` added in Sprints 5-7; later, a regenerated copy accidentally reverted `BuildingState`'s starvation-hysteresis fields) and is removed for that reason — a duplicate that can silently drift is worse than no duplicate. `core/types.ts` is authoritative; this file states the RULES that govern it, not its current shape.

Orientation only (names, not definitions — read the file for the real shape): `ResourceId`, `ResourceState`, `HardwareState` (tiered), `RoleId`, `StaffState`, `Astronaut`, `BuildingDef`, `BuildingState`, `Process`, `Modifier` (supports `expiresAt` for temporary effects), `PadMissionState`/`MissionState` (per-pad since schemaVersion 1), `EconomyFlags`, `GameState`. Standing rules that apply regardless of the schema's current exact shape: Staff is never a `ResourceState`; missions are per-pad, never singular; modifiers resolve by timestamp, never tick-countdown; one-time payments may exceed a cap, passive production halts at cap; costs may declare a `minTier` requirement.

## Context economy (read this before "Per-sprint workflow" — it changes how you read everything below)
The docs and PROGRESS.md grow every sprint; reflexively reading every file in full, every session, gets more expensive as the project matures and eventually competes with the token budget actual work needs. Rules:
- **Full reads are for genuine audits** (design reviews, doc-consistency checks, re-anchoring after a context compaction/new session where you must confirm repo state matches the docs). Routine sprint work does not need this.
- **For a specific lookup** (a building's cost, a node's effect, a mechanic's rule), `grep`/search the relevant doc for the term first — don't load the whole file to find one fact you could find in one command.
- **PROGRESS.md**: read only the current/most recent 1-2 sprint entries for routine work. Read further back only when investigating something historically specific (e.g. "when did this field get added").
- **The 6 design docs**: for a given sprint, you typically need the sections SPRINTS.md's own entry for that sprint points at — not the entire file. Each doc's own changelog is compressed to full-detail-for-latest-versions-only for the same reason (see each file's own top section) — don't read past that point looking for "how we got here" unless the task specifically requires it.
- This file (CLAUDE.md) is short by design and safe to read in full every session — it's the one doc written to stay cheap.

## Per-sprint workflow
1. Read the CURRENT sprint's section in SPRINTS.md and its acceptance criteria — not the whole sprint history
2. List tasks; confirm every needed value exists in ECONOMY_MODEL.md
3. Implement core → data → UI, core tests first
4. Run `sim/run.ts` when the sprint touches economy values; verify sanity rules still hold
5. Verify acceptance + save/load regression — **acceptance criteria are verified through the integrated path (real store, real resolution flow, end to end), never by isolated unit tests alone**: a unit-tested function nobody calls is not an accepted feature. For any sprint that touches UI, run a rendered smoke check (Playwright headless via the run skill's fallback — installed in the scratchpad, NEVER added as a project dependency) covering the sprint's new interactions, and screenshot-verify at least one multi-word/edge-case label
6. Commit per task; on sprint close, update `docs/PROGRESS.md` with status and deviations — and if PROGRESS.md is getting long, compress older sprints' write-ups down to a short paragraph each, keeping full detail only for the last 2-3 sprints (same compression principle as the design docs' own changelogs)
