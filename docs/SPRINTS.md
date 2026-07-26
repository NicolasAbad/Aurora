# SPRINTS.md — Aurora Program — Step-by-step development plan
*Every sprint ends in a playable build. No sprint adds systems outside the GDD without updating the GDD first. Development Phase 1 = Sprints 0–8 (through the first successful launch). No monetization code anywhere in v1.*

**v2.1 changes:** Sprint 0 adds the headless balance simulator (the "Phase 0 simulation" ECONOMY_MODEL references now exists as a deliverable); Sprint 2 adds the dev-only time-warp; Sprint 1 covers insolvency; Sprint 7 implements roll commitment; Sprint 8 closes Phase 1 with a **private** playtest build (public playtest stays in Sprint 12); Sprint 12 defines the telemetry endpoint decision.

## Sprint 0 — Foundations (2–3 days)
1. Scaffold: Vite + React + TS + Zustand. ESLint + Prettier + Vitest.
2. `state/persistStore.ts`: localStorage save/load, `schemaVersion: 1`, migration registry, autosave 10 s + on close.
3. `core/economy.ts`: `costAtLevel`, `productionPerSecond` + unit tests against ECONOMY_MODEL §4.
4. `data/buildings.ts`: all **18** buildings + internal upgrades transcribed (stable ids: `finance`, `vab`, `launchRail`, `padB`…).
5. **`sim/run.ts` — headless balance simulator (dev-only, env-gated):** runs the economy with a simple bot policy (build cheapest useful thing, keep salaries paid, fly when possible) at accelerated time; outputs a day-by-day CSV (resources, income/expense, salary ratio, research income split lab-vs-Flight-Data). This is the tool that verifies ECONOMY sanity rules (salaries 30–50% at 5 checkpoints; Flight Data ≥ 25% of Research income in flight eras). Re-run whenever ECONOMY values change.
6. UI shell: top ticker (4 resources + rates), complex tabs (Campus only active), number formatting (§12).
**Acceptance:** app loads, persists across reload, shows Funding 0 and the pitch button; `sim/run.ts` produces a coherent 3-day CSV.

## Sprint 1 — Economic core (3–4 days)
1. Manual actions (pitch, 1 s cooldown) with floating +10 feedback.
2. Timestamp-based game loop (`requestAnimationFrame` + delta; NEVER accumulating setInterval) in `core/tick.ts`.
3. Build/upgrade Campus: Offices, Finance, Quarters, R&D Lab.
4. Staff: hire Technicians, assign/unassign slots, per-second salaries, Quarters cap.
5. **Insolvency (GDD §1b):** Funding 0 with salaries due → staffed production pauses, `payrollUnpaid` flag drives the ticker banner; auto-resume on payment. Unit tests in `core/economy.ts`.
6. Resource caps (pre-Warehouse): production halts at cap with amber ticker warning; one-time payments exceed caps per GDD §1c (test both).
**Acceptance:** pitch→hire→assign→passive Funding loop works; salary burn visible; letting Funding hit 0 pauses production and recovers via pitching; reload neither loses nor duplicates resources.

## Sprint 2 — Time engine & offline (3–4 days)
1. `core/time.ts`: process queue `{id, kind, startedAt, durationMs, payload}`; parallel processes; timestamp resolution.
2. Offline calc on open: resources **and salaries** at 60%, 10 h cap; processes at 100%; insolvency resolved with the same online logic; "While you were away" screen with breakdown (including any payroll stoppage window).
3. **Dev time-warp (dev builds only, env-gated):** global time multiplier ×1 / ×60 / ×600 applied at the timestamp layer, so offline, processes and economy all accelerate consistently. Without this, multi-hour timers are untestable.
4. Process UI: progress bar + remaining time on building tiles.
5. Telemetry middleware (`state/telemetry.ts`): FTUE funnel events to exportable local buffer.
**Acceptance:** close 1 h and return shows correct summary (clock-manipulation test); two parallel processes resolve correctly; a full simulated day runs in <3 min at ×600.

## Sprint 3 — Full production (3–4 days)
1. Complex B: Supply Depot, Fabrication (consumes Materials per Hardware; produces at current tier into `byTier`), Refinery, Warehouse, Propellant Depot.
2. Input-starved buildings pause with indicator (never negative production).
3. Manual gathering + Rush Order action.
4. Complex B unlock by lifetime Funding ≥ 300 (lifetime counter, not balance).
5. Hardware tiers as first-class state (`byTier`, Aluminum only until Titanium tech); cost checks support `minTier`.
**Acceptance:** Materials→Hardware and Materials→Propellant chains run with their own caps; starvation pauses visible; tier bookkeeping invariant (sum(byTier) === amount) holds under tests.

## Sprint 4 — Research (2–3 days)
1. `data/research-tree.ts` per ECONOMY_MODEL §5 (deps, cost, duration, declarative modifier effects) — including Remote Ops (offline cap 16 h).
2. Research as timed process (one node at a time in v1).
3. Research panel: branches, locked/available/in-progress/done states.
4. Central modifier system (`core/modifiers.ts`): every bonus source registers modifiers; systems query them — NEVER hardcode a bonus inside a system.
5. Role promotions (Classroom upgrade) as timed process.
**Acceptance:** Basic logistics reduces transfer 25% via modifier; Remote Ops raises the offline cap via modifier; save/load preserves in-progress research.

## Sprint 5 — Testing & designed failure (3 days)
1. Complex C: Engine Test Stand (build + slots).
2. Certifications as processes (§6), including extended certification for every engine type.
3. **Scripted failure**: first Probe-1 test always fails → recover 6 H, +30 XP, +100 Flight Data, narrative N-07, unlock retry.
4. Mission Log: feed component (collapsible bottom panel) + `data/narrative.ts` with milestone triggers.
5. Flight Experience visible as a resource (no trees yet). Flight Data flowing into Research per §8 — verify the lab-vs-Flight-Data split in `sim/run.ts` output.
**Acceptance:** full test-fail-narrative-retry-certify flow works and is narrated.

## Sprint 6 — Sounding rockets: the first launches (3 days)
1. Launch Rail (+ Extended Rail upgrade) and sonda assembly at the Test Stand workshop (ECONOMY §7a).
2. S-1 mini-checklist (3 items) + simplified Confidence (base 65) + roll commitment at checklist completion + countdown + results — the full launch loop in miniature.
3. Tier-0 sounding-payload contracts (1 offer, 6 h rotation; all-inclusive cost per §10): the early financial engine.
4. S-2 + Kármán line record + beats N-08b/N-08c.
**Acceptance:** repeatable S-1 campaign funds progress via tier-0 contracts; extended certification reaches 100% Confidence; S-2 crosses Kármán and awards its record.

## Sprint 7 — VAB, Aurora I & full Launch Sequence (4 days)
1. Complex D: VAB, Pad, Launch Control, Tracking Station (build, slots, unlock via Flight program tech). Mission state is per-pad (`pads.padA`) from the start.
2. Aurora I stage integration incl. satellite payload (§7): sequential timed stages; rocket state machine; propellant loading (T-08 depot-capacity tooltip).
3. Full 8-item Launch Sequence screen + `core/confidence.ts` (GDD §7b) with visible breakdown; Orbital-1 probabilistic certification + its extended certification.
4. **Roll commitment:** `committedRoll` drawn and persisted at checklist completion; countdown resolves it deterministically (export/import cannot re-roll — regression test).
5. Countdown → resolution → results with rewards + Records; failure resolution (60% Hardware recovery, 80% success-XP, half-time re-integration, no Rep/payout).
**Acceptance:** end-to-end first satellite launch; confidence matches formula and 100% is reachable without XP; sonda loop and full loop coexist.

## Sprint 8 — FTUE & Phase 1 close (3 days)
1. Opening sequence (GDD §11): first decision <30 s, contextual one-time tooltips (NARRATIVE §2).
2. Locked complexes greyed with visible conditions; milestone call-outs (small non-blocking modal).
3. Polished "While you were away" (incl. payroll-stoppage reporting); designed session-1 ending (a timer always left running).
4. Settings screen (UI_SPEC §6): save export/import (string + file), manual save, hard reset, sound/motion toggles. Import validates version and rejects corrupt saves with a clear message.
5. Funnel verification via telemetry; balance pass = `sim/run.ts` day-by-day output vs the session table (including the sonda campaign days).
6. QA: save/load regression on every system; offline with every process kind; export→wipe→import round-trip test.
7. **Private playtest build:** deploy to itch.io as a private/unlisted build for 3–5 trusted testers with the feedback form. The game's #1 risk is multi-day pacing, which cannot be validated solo — do not wait until Sprint 12 for external eyes.
**Acceptance (END OF PHASE 1):** a fresh tester reaches the first successful SATELLITE launch (Aurora I) with no external explanation, having flown multiple sondas along the way, over a multi-day arc.

## Sprint 9 — Contracts & events (3–4 days)
1. Payload Processing + `core/contracts.ts`: generator (2 offers, 8 h rotation, §10 templates), pad queue shared with story missions.
2. Full contract cycle: accept → build payload → checklist → launch → pay/deadline fail (−15 Rep, floor 0). Tier-2 requires Titanium-tier Hardware via `minTier`.
3. **Launch Pad B**: buildable after Aurora I success + Rep ≥ 40 (ECONOMY_MODEL §4). Adds `pads.padB` — **no schema migration needed** (per-pad state since Sprint 7). The scarcity phase (one pad) must be felt first; Pad B is the earned relief and the "program is growing" beat (narrative N-17).
4. Random events (`core/events.ts` + NARRATIVE §3): 15% check per 10 min, always 2 options, never during countdown; E-04's salary premium implemented as a modifier.
**Acceptance:** pad-queue tension works; deadlines penalize correctly; private-playtest feedback from Sprint 8 triaged into fixes or BACKLOG.

## Sprint 10 — XP trees & orbital mission (3 days)
1. Flight Experience trees (§9) via modifier system; mechanic-changing nodes (Queues, Reusability, Parallel integration) with dedicated logic.
2. Tracking Station + XP multiplier; Orbital flight tech; Aurora II (probabilistic Orbital-1 cert, mission-2 requirements).
3. v1 ending screen: orbital milestone + crewed-program teaser.
**Acceptance:** full v1 arc playable; every XP node produces its measurable effect.

## Sprint 11 — Polish (3 days)
Rolling number animation, checklist transitions, minimal optional sound (countdown + success), full narrative text review, accessibility pass, performance (tick must not re-render unchanged tiles — Zustand selectors). **Contextual job titles:** staff slots display a per-building flavor title as secondary text (e.g. Finance: "Fundraising associate"; Launch Pad: "Pad crew") while the mechanical role stays visible — presentation only, roles/pools/data untouched; titles live in NARRATIVE_EVENTS (new §, referenced by ID).

## Sprint 12 — Web playtest (public)
1. Deploy (itch.io + Vercel), feedback form.
2. **Telemetry decision (default: minimal remote endpoint):** a single Vercel serverless function receiving anonymous batched funnel events (opt-in checkbox in Settings, disclosed plainly). Without a remote sink, D1/D7 retention CANNOT be measured — if the endpoint is cut, delete the retention benchmarks from this sprint and treat the playtest as qualitative-only. No third-party analytics SDKs in v1.
3. **Distribution:** post to r/incremental_games (the genre's home community — feedback there is expert-level), itch.io devlog, incremental-games forums/Discords. One honest "solo dev, first playable, brutal feedback welcome" post outperforms any ad.
4. Metrics vs benchmarks (D1 35–40%, D7 10–15%) + funnel review.
Android + monetization are a SEPARATE post-launch phase, planned only after reading playtest data.
