# PROGRESS.md — Aurora Program

## Sprint 0 — Foundations — COMPLETE (2026-07-24, reconciled against docs v2.2 same day)

All 6 tasks done; acceptance criterion verified (app loads, persists across reload,
shows Funding 0 and the pitch button; `sim/run.ts` produces a coherent day-by-day CSV).

**Built:**
- Vite + React + TS + Zustand scaffold; ESLint (flat config) + Prettier + Vitest wired.
- `src/core/types.ts` — GameState schema transcribed from CLAUDE.md, with `UnlockCondition`
  and a few other CLAUDE.md-referenced-but-undefined types (`ContractState`, `LaunchRecord`,
  `TelemetryEvent`) given a first structural shape (placeholders — Sprint 9/2 own the real
  ones; kept schema-compatible now so schemaVersion 1 needs no migration later).
- `src/core/economy.ts` — `costAtLevel`, `productionPerSecond`, `pitchYield`, unit-tested
  against ECONOMY_MODEL §2/§4 values.
- `src/core/format.ts`, `src/core/selectors.ts` — number formatting (§12, 3 sig figs) and
  a `getResourceRatePerSecond` selector, both unit-tested.
- `src/data/buildings.ts` — all 18 buildings + internal upgrades transcribed from
  ECONOMY_MODEL §4, including Crew Quarters' `staffCapBonus: 3`.
- `src/data/initialState.ts` — starting GameState per ECONOMY_MODEL §1.
- `src/state/persistStore.ts` + `migrations.ts` — localStorage save/load, schemaVersion 1,
  migration registry (empty, scaffolded), autosave every 10s + on close/hide, unit-tested.
- UI shell: `Ticker` (4 resources + rates, cap/amber/over-cap states, secondary row),
  `ComplexTabs` (Campus active, others locked with stated condition), a minimal Campus
  panel (Offices + a disabled Pitch button — full manual-action wiring is Sprint 1 task 1,
  intentionally not built early to avoid overlapping that sprint's scope).
- `sim/run.ts` — headless balance simulator (dev-only; nothing under `/src` imports it, so
  it's structurally excluded from the production bundle — confirmed via `npm run build`).
  Runs a bot policy against the real `core/economy.ts` + `data/buildings.ts`, plus local
  transcriptions of research/certification/sonda/Aurora-I values ECONOMY_MODEL owns but no
  data module exists for yet. `npm run sim -- --days=N --seed=N`.

**Also fixed during reconciliation:** the v2.2 update to CLAUDE.md had landed at
`docs/CLAUDE.md` instead of the root `CLAUDE.md` the harness actually auto-loads each
session (CLAUDE.md's own text says it "lives at repo root"). Diffed the two (one line:
the `staffCapBonus` field), applied it to root `CLAUDE.md`, deleted the stray `docs/`
copy so there's a single source of truth again.

## Sprint 0 findings — all six resolved against docs v2.2

1. **Pitch yield.** Resolved: single formula, `10 + 5 × (officesLevel − 1)` (ECONOMY §2).
   Added `core/economy.ts`'s `pitchYield()`, unit-tested (lv1=10, lv2=15, lv3=20).
   `sim/run.ts` now calls it instead of its old ad-hoc `5 × level`.
2. **Crew Quarters staff cap.** Resolved: `BuildingDef` gained `staffCapBonus?: number`
   (CLAUDE.md schema + `core/types.ts`); Crew Quarters sets it to `3`. Starting staff cap
   is 2 (ECONOMY §1). `sim/run.ts`'s `staffCap()` now reads `2 + staffCapBonus × level`
   instead of its old guessed base of 3.
3. **Tech-tree bootstrap dependency.** Resolved: ECONOMY §3 now states the bootstrap rule
   explicitly ("role-unlock techs gate direct hiring only; promotions are gated only by
   the Classroom"). `sim/run.ts` already implemented this in Sprint 0 — no code change
   needed, just confirms the sim wasn't guessing.
4. **Aurora I stage durations.** Resolved: ECONOMY §7 now states Satellite payload = 15
   min, Flight review = instant (0 min, pure Research spend, applies to all flight
   reviews). Matches what `sim/run.ts` already assumed — no code change needed.
5. **Number formatting.** Resolved: ECONOMY §12 now specifies 3 significant figures
   exactly (10.0K / 125K / 1.25M / 3.10B). `core/format.ts` rewritten to match
   (decimals = 2/1/0 depending on the mantissa's magnitude); tests updated to check all
   four documented examples.
6. **Program Record triggers ("Launch 1" wording) — my Sprint-0 finding here was wrong,
   not just resolved.** I had written it up as "confirmed, not a gap" — asserting that
   "Launch 1" meant the S-2 flight — without asking. That was an assumption presented as
   settled fact, which is exactly what CLAUDE.md rule 1 says not to do. ECONOMY §8b now
   defines record triggers by named event instead: First flight = first S-1 sonda
   *launch*, Kármán = first successful S-2, First orbit = Aurora I success. Fixed in
   `sim/run.ts`: `firstFlight` now awards on the first S-1 to lift off (was incorrectly
   bundled with `pastKarman` at S-2); `pastKarman` stays on first S-2 success; `firstOrbit`
   stays on Aurora I success (was already correct).

   **Correction on top of that fix (same day):** the owner caught a second imprecision —
   "First flight" triggers on the S-1 *launching* (lifted off, whether it later succeeds
   or fails — same spirit as "First ignition, even the scripted failure"), not on it
   *succeeding*. My first fix had described it as "first successful S-1." The sim doesn't
   model S-1 failure at all (see `sim/run.ts` header), so "launched" and "succeeded" are
   the same event in its current behavior either way — but the code comment and this
   file's wording were imprecise, and now say "launch," not "success."

   **The open question this uncovered — now resolved by the owner, not by me:** ECONOMY
   §8b retired "Launch 1" as a record-trigger label, but ECONOMY §4 (Launch Pad B) and
   GDD §3 (Payload Processing) still used launch-number wording for those two *building
   unlocks* without saying which event it meant. Docs now say explicitly: both unlock on
   **Aurora I success** (ECONOMY §4, GDD §3, GDD v2.2 changelog) — "Launch 1" is retired
   everywhere, not just in §8b. Applied: `UnlockCondition`'s `firstLaunch` kind renamed to
   `auroraISuccess` in `core/types.ts`; `data/buildings.ts`'s Payload Processing and
   Launch Pad B both use it now; `sim/run.ts`'s `isUnlocked()` checks
   `state.auroraILaunched` directly (the internal `firstLaunchHappened` flag, which had
   been doing double duty as both "has the bot flown its one S-2" and this unlock
   placeholder, is now two separate things: `s2Flown` for the former, `auroraILaunched`
   — already tracked — for the latter).

## Process note

Per the reminder that came with this reconciliation: going forward, any doc ambiguity is
a stop-and-ask, not an interpretation — including a clearly-documented one. Finding #6's
open question was written up that way on purpose (flagged, not guessed at), and came back
resolved by the owner rather than by further guessing — which is what should happen next
time too.

## Instrumentation upgrade: "optimal" vs "human" bot profiles

The 3-day Aurora I result reported earlier (below) came from a single always-on bot, and
there was no way to tell from it whether that was the ECONOMY being fast or the bot being
superhuman. Per instruction: **no ECONOMY_MODEL value was changed to investigate this** —
only the simulator's instrumentation.

**What changed in `sim/run.ts`:**
- Two profiles now run every invocation, each producing its own CSV and console report:
  - **`optimal`** — the original Sprint 0 bot, unchanged: always on, re-evaluates
    spending every 15 simulated minutes around the clock. An upper bound, not a target.
  - **`human`** — new. 3 active sessions/day of ~20 min (hours 7/14/21, a sim-only
    scheduling assumption, not sourced from any doc). Manual actions (pitch, Funding
    Rounds, hiring, building, promotions) and starting any new process (research node,
    certification test, sonda assembly, accepting a contract) only happen in a session.
    The rest of the day resolves like the game's own offline rule (ECONOMY §11):
    resources and salaries at 60%, capped at 10h (16h once Remote Ops is researched);
    process *timers already in progress* still complete at 100% regardless, same as the
    real offline rule specifies.
- CSV gained a funding-income breakdown by source (pitch / Funding Rounds / passive
  Finance / contracts / records) — previously one merged "passive" + "one-time" pair.
  Research's lab-vs-Flight-Data split already existed and is unchanged. Implementing the
  Funding Rounds column meant giving the bot Funding Round I/II logic it didn't have
  before (reputation-gated, prefers II once both qualify) — an instrumentation
  necessity, not an economy change: the bot now uses an action the docs already define.
- Both profiles report milestones, the 5-checkpoint salary ratio, Flight Data share, and
  which simulated day Aurora I launched on (or "not reached").

**A bug the first draft of this exposed:** the initial "human" implementation gated only
manual *spending* decisions (pitch/hire/build) to sessions, but left starting new
research/certification/sonda/contract processes running every tick regardless of session
— so "human" reached Aurora I in 3 days too, same as "optimal," which made no sense (a
player who's only around 3 sessions/day shouldn't out-pace a bot that's never away).
Fixed: starting a new process is a player action (a checklist click, an "accept offer"
click) exactly like the others, so it's gated the same way now — with one doc-grounded
exception: VAB stages auto-advance once "VAB queues" tech is researched, since
auto-queueing stages is literally what that research node does (ECONOMY §5).

## Days to Aurora I — both profiles (seed 42, 30-day run, current bot policies)

| Profile | Days to Aurora I | Salary ratio (settles) | Flight Data share |
|---|---|---|---|
| optimal | 3 | ~53% (target 30-50%) | ~16.9% (target ≥25%) |
| human | **5** | ~55% (target 30-50%) | ~1.9% (target ≥25%) |

**Decision rule (owner's, applied literally, not interpreted):** flag only if human
reaches Aurora I in *under* 5 days. Day 5 does not satisfy "under 5" — no flag raised,
per the rule as given. Reporting the number precisely because it's a boundary case, not
a comfortable margin: a slightly different bot policy or session schedule could plausibly
land on day 4 or day 6. No ECONOMY_MODEL value was changed based on this result, per
instruction 3's rule either way.

**Also worth the owner's attention, separately from the day-5 rule:** the human profile's
Flight Data share (~1.9%) is far under the ≥25% target once the sonda loop is
session-gated — sondas just don't fly often enough at 3×20min/day to matter much against
lab Research income at this bot's policy. This is a different signal than "days to Aurora
I" and isn't covered by the standing decision rule, but it's the kind of thing the
Flight-Data-share sanity check exists to catch. Flagged as an observation, not a
recommendation — not tuning it.

Both profiles' full day-by-day CSVs are in `sim/output/` (gitignored, regenerated per
run): `day-by-day-optimal-seed42-30d.csv`, `day-by-day-human-seed42-30d.csv`.

Re-run per CLAUDE.md workflow whenever ECONOMY_MODEL values change: `npm run sim --
--days=N --seed=N` runs both profiles in one invocation.

**Superseded by the v2.3 rebalance below** — the owner's decisions on both signals above
(day-5 accepted as a codified floor; the 1.9% Flight Data share confirmed as a real
economy bug) changed the relevant values and the target itself. Left in place as a
record of what prompted v2.3, not as current numbers.

## v2.3 rebalance — owner decisions applied

Two decisions on the signals above, both applied to data, not guessed at:

1. **Day-5 pacing floor: accepted, now codified.** `sim/run.ts` reports it every run
   (`printSummary`'s "Pacing floor" line, PASS/FAIL, always shown for the human
   profile) and raises a loud FLAG in the final comparison if human ever reaches
   Aurora I before simulated day 5. Rationale carried over from the owner: "human" is
   an efficient lower bound (no FTUE friction, no mistakes, no launch failures) — real
   players will be slower. Revisit with real testers at Sprint 8, not before.
2. **Flight Data at 1.9%: confirmed as a real economy bug, rebalanced in ECONOMY v2.3.**
   R&D Lab cut 0.1 → 0.03 R/s per level; Flight Data raised ~1.5× across the board
   (scripted failure 100→150, S-1 80→120, S-2 400→600, Aurora I 800→1,200, contracts
   now explicitly 250-450 — see below). Target reformulated as a per-era range:
   **Flight Data = 20-35% of Research income**, checked separately for the sonda and
   satellite eras (pre-flight is reported too but has no target — lab-only by
   construction, before any flight has happened).

**Applied to data:**
- `src/data/buildings.ts`: R&D Lab `basePerSec` 0.1 → 0.03.
- `sim/run.ts`'s local reward tables: scripted-failure Flight Data 100→150, `S1_REWARD`
  120, `S2_REWARD` 600, `AURORA_I_REWARD` 1,200 (all ECONOMY §6/§7a/§8 v2.3 values).
- `sim/run.ts` gained era classification (`classifyEra()`): each CSV row is now tagged
  `preFlight` / `sonda` / `satellite`, based on `firstFlightDataDay` (first Flight Data
  ever earned) and `auroraILaunchedDay`. `printSummary` reports the Flight Data share
  per era instead of one merged number.

**A gap found and fixed while wiring this up:** ECONOMY §8's "Contract fulfilled" row
(+40-80 XP / +250-450 Flight Data) was never implemented in the sim at all —
`tickContract` only ever paid Funding + Reputation. Since the sim only models tier-0
contracts, it now uses the low end of both ranges (40 XP / 250 Flight Data) — a specific
choice within a documented range, not an invented number, but flagged as a modeling
choice since the doc doesn't say which tier maps to which end of the range.

**A second, more serious bug found on the v2.3 re-run:** "optimal" went from reaching
Aurora I on day 3 to not reaching it at all within 30 days — funding stuck at exactly
200, payroll unpaid for the entire day, every day, from day 3 onward. Root cause:
`resolveManualPitch`'s condition was `passiveFundingRate(state) <= 0 || funding < 200`.
`passiveFundingRate` returns Finance's *theoretical* rate, which stays positive once
Finance is built+staffed — it doesn't know insolvency is actually blocking that income.
Once funding landed exactly at/above 200 while insolvent, neither condition was true, so
the bot stopped pitching forever, and with no income, insolvency never cleared: a true
deadlock. Fixed by checking `state.payrollUnpaid` explicitly, matching GDD §1b's own
description of pitching as the insolvency bail-out. This was a sim bug (bad bot logic),
not an economy issue — the R&D Lab/Flight Data rebalance didn't cause it directly, but
shifted the exact purchase/timing sequence enough that funding happened to land on the
deadlock condition this run, where it hadn't before.

### Results (seed 42, 30-day run, post-fix)

| Profile | Days to Aurora I | Pacing floor | Salary ratio (settles) |
|---|---|---|---|
| optimal | 3 | n/a (floor only applies to human) | ~53% (target 30-50%) |
| human | 5 | **PASS** (reached day 5, not before) | ~55% (target 30-50%) |

**Flight Data share per era — human profile (the target's stated population):**

| Era | Days | Share | Target |
|---|---|---|---|
| pre-flight | 2 | 0.0% | none (lab-only by design) |
| sonda | 2 | **14.7%** | 20-35% |
| satellite | 26 | **16.2%** | 20-35% |

**Reporting, not tuning, per instruction:** both eras miss the 20-35% target even after
the v2.3 rebalance, though less badly than the pre-rebalance 1.9% overall figure. The
sonda era is only 2 simulated days wide for this bot/seed (Aurora I follows fast once the
sonda campaign starts), so that figure in particular rests on a small sample — worth a
longer or different-seed run before reading too much into it. Optimal's own per-era
split is in its CSV/console output for reference, but the target is scoped to the human
profile per GDD §1, so that's what's reported here.

Both profiles' full CSVs (with the new `era` column) are in `sim/output/`, regenerated
per run: `day-by-day-optimal-seed42-30d.csv`, `day-by-day-human-seed42-30d.csv`.

## v2.4: contract rewards made explicit per tier

ECONOMY §8's contract reward range (+40-80 XP / +250-450 Flight Data) is now explicit
per tier (XP 40/60/80, Flight Data 250/350/450 for tier-0/1/2; Reputation now defers to
§10's 3/10/25 instead of the old, self-contradicting +10-25 range). `sim/run.ts`'s
`CONTRACT_REWARDS` table now reads tier-0 directly from the spec instead of resting on
last pass's "low end of the range" interpretation (which happened to match, but no
longer needs to be trusted to). Tiers 1/2 are in the table for when satellite contracts
are implemented; the sim still only models tier-0.

## Multi-seed sweep: human profile, seeds 1-10, 45 days

Requested before any further Flight Data tuning, since one seed with a 2-day sonda
sample was too thin to act on. `npm run sim -- --sweep=true --days=45` runs this (default
sweep length 45 days if `--days` omitted).

**Days to Aurora I:** median 5.0, range 5.0-5.0 (all 10 seeds identical).
**Days to Kármán line:** median 4.0, range 4.0-4.0 (all 10 seeds identical).
**Flight Data share — sonda era:** median 14.7%, range 14.7-14.7% (target 20-35%).
**Flight Data share — satellite era:** median 15.9%, range 15.9-15.9% (target 20-35%).

**Important caveat on the zero variance — read before trusting the range numbers at face
value:** this isn't a bug, but it means the sweep explored less than it looks like. The
bot's policy is deterministic everywhere except one roll: Orbital-1 base certification
(80% success, ECONOMY §6). Verified `mulberry32` produces genuinely different sequences
per seed (checked outside the sim). Of seeds 1-10, 9 succeed on the first attempt with
zero behavioral difference from each other (nothing else in the bot branches on RNG); seed
4 fails and retries at half duration (adds ~1.5h), but that shift is invisible at
day-level granularity and rounds away in the aggregated percentages. So: the median is a
trustworthy central estimate (nothing suggests it's an outlier), but the "range" column
doesn't mean "explored variance is zero" — it means this particular bot rarely gambles,
so seed alone barely moves the needle. Real variance (players failing launches, missing
sessions, gambling on Confidence) isn't modeled by either bot profile.

**Research stalls (>12h blocked on an eligible node with deps clear):** all 10 seeds
show exactly one — `basicEngineering`, crossing the 12h threshold on day 1, every time.
This is the bootstrap gap: Research sits at 0 for the better part of a day while the bot
buys Crew Quarters + Classroom and runs the Technician→Engineer→Scientist promotion
chain (15min + 45min timers, each gated on Funding) before the R&D Lab has any Scientist
to staff it at all. No further stalls were logged after day 1 for any seed — once the
pipeline is running, no single node sits blocked past 12h again under this bot's
priority order. This stall is a consequence of the promotion bootstrap taking real time
more than of the R&D Lab rate specifically (it happens before the Lab produces anything
regardless of its rate) — flagged since it's a genuine scarcity finding, not the one
being asked about, but the kind of thing worth knowing about.

**Decision-rule check (owner's rule, applied to the data, not by me):** median sonda
share 14.7% and median satellite share 15.9% are both under 20% — per the standing rule,
that's the "raise Flight Data values in the docs" branch. Reporting the numbers; the
decision and any v2.5 values are the owner's.

Per-seed detail: `sim/output/sweep-summary-human-seeds1-10-45d.csv`. Per-seed full
day-by-day CSVs are also written (one per seed, same naming convention as the dual-profile
run) but not enumerated here — regenerate via the command above.

## Sprint 1 — Economic core — COMPLETE (2026-07-24)

All 6 tasks done; acceptance verified (see below).

**Built:**
- `src/data/roles.ts` — ROLES table (hiring cost, salary/s, unlock tech) + `STARTING_STAFF_CAP`
  transcribed from ECONOMY §1/§3.
- `src/core/staff.ts` — pure staff helpers: hiring cost, staff cap, role-unlock check,
  slot/assignment bookkeeping, total salary/s. Unit-tested.
- `src/core/economy.ts` gained `applyGrant` (passive halts at cap, one-time ignores it —
  GDD §1c) and `resolveEconomyTick` (salary-then-production resolution with insolvency —
  GDD §1b). Insolvency tests live here per SPRINTS.md's explicit instruction.
- `src/core/tick.ts` — `createGameLoop`, a `requestAnimationFrame`-driven loop computing
  delta as `now - lastFrameTime` (never an accumulating counter, CLAUDE.md rule 6).
  Dependency-injected `requestFrame`/`cancelFrame` so the delta logic is unit-tested with
  a fake clock, no real timers or real RAF involved.
- `src/core/actions.ts` — pure resolvers for the four Sprint 1 player actions (`applyPitch`,
  `buyBuildingUpgrade`, `hireStaff`, `adjustStaffAssignment`), each returning the updated
  state slice or `null` if the action isn't currently valid.
- `src/state/persistStore.ts` — the Zustand store now carries `pitch`/`buyBuilding`/`hire`/
  `assign`/`applyTick` actions alongside the `GameState` data, wired to the pure
  `core/actions.ts` + `core/economy.ts` functions via `set`/`get`. `main.tsx` starts the
  game loop alongside the existing autosave.
- UI: functional `PitchButton` (1s cooldown, floating `+N` feedback), `BuildingTile`
  (upgrade button with live cost/afford state, staff assignment steppers for buildings
  with slots), `StaffHiring` (hire button per role, locked roles show their required
  tech, salary burn displayed), `PayrollBanner` (persistent banner while insolvent).
  `data/buildings.ts` gained a `name` field (all 18) for these to display.

**Verification:**
- 58 unit/integration tests passing (up from 22 at Sprint 0 close), including two
  integration tests against the real Zustand store exercising the full pitch→buy
  Finance→hire→assign→tick loop and the insolvency-pause/auto-recovery cycle end to end.
- Typecheck, ESLint, production build all clean.
- **Actually clicked through it in a real browser** (correcting Sprint 0's and this
  sprint's earlier note that no browser tool was available — the `run` skill's
  Playwright fallback worked: installed Playwright + Chromium into the scratchpad,
  not the project, so it isn't a project dependency). Confirmed live: all four Campus
  tiles + Staff panel render; pitch increases Funding with floating `+10` feedback and
  a real 1s cooldown (button disables, re-enables); buying Finance deducts cost and
  bumps its level; hiring + assigning a Technician to Finance works; hiring with 0 F
  left correctly trips insolvency next tick (GDD §1b: even a small unpayable salary
  pauses production) — the PAYROLL UNPAID banner appeared, Finance's production
  visibly stalled at 0; pitching back above the salary line cleared the banner and
  Finance resumed producing on its own with no further clicks (55 F → 57 F over 3s,
  zero clicks). Zero browser console errors throughout.
- **Found and fixed a real bug this way:** `.building-tile__header` used
  `justify-content: space-between` with no `gap`, so "Crew Quarters" (the one
  multi-word building name) rendered as "Crew QuartersLevel 0" — squashed together
  with no space, because space-between only inserts space when there's slack left
  in the row. Added `gap: 8px`; confirmed fixed via a follow-up screenshot. The
  shorter one-word names (Offices, Finance) never showed this, which is exactly why
  a rendered check catches things a unit test wouldn't.
- `sim/run.ts` re-run after the `data/buildings.ts` `name` field addition — unaffected,
  still produces coherent output.

**Scope notes:**
- R&D Lab can be built/upgraded this sprint but can never be staffed yet (Scientist role
  needs `scientificMethod` tech, which doesn't exist until Sprint 4) — it will show 0
  Research output all sprint. Expected, not a bug; matches the sim's own promotion-
  bootstrap finding from earlier reconciliation passes.
- Complex B/C/D and their buildings stay locked/inactive — Warehouse (and its `capBonus`)
  isn't reachable this sprint, so `buyBuildingUpgrade`'s cap-bonus path is implemented
  and unit-tested but not yet exercised by any real playthrough action.
- Hardware-cost deduction in `core/actions.ts`'s `payCost` only touches `.amount`, not
  `byTier` — fine for Sprint 1 (no Sprint-1 cost includes Hardware), and Sprint 3's own
  task list ("Hardware tiers as first-class state") is where tier-aware cost deduction
  belongs, not here.

## v2.5 rebalance — Flight Data raised, economy locked

Median Flight Data share came in under 20% in both flight eras at v2.4 values (14.7%
sonda, 15.9% satellite, seed-1-10 sweep). Per the owner's decision rule, that triggered
the "raise Flight Data, don't touch the lab again" branch. v2.5 raised Flight Data
~1.7× across the board and widened the salary sanity band to 30-55% (settling at ~53-55%
is *intended* pressure, not a miss — that's what makes the insolvency mechanic matter).

**Applied to `sim/run.ts`:** static fire success 80→150, scripted failure 150→250, S-1
120→200, S-2 600→1,000, Aurora I 1,200→2,000, contract Flight Data 250/350/450→450/600/750
(tier 0/1/2). Salary-band target strings updated to 30-55%.

**A second gap found and fixed while wiring this up:** ECONOMY §8's "Static fire success"
reward row (+15 XP, +2 Rep, +150 Flight Data) was never implemented at all — only the
scripted failure (Probe-1 test 1) granted anything; test 2's guaranteed success granted
nothing. This has been true since v2.1; raising Flight Data values is what made it worth
noticing and fixing now. Added `STATIC_FIRE_SUCCESS_REWARD`, wired into Probe-1 test 2's
completion.

**Sweep re-run (seeds 1-10, 45 days, human profile) at v2.5 values:**

| Metric | Median | Range |
|---|---|---|
| Days to Aurora I | 5.0 | 5.0-5.0 |
| Days to Kármán | 4.0 | 4.0-4.0 |
| Flight Data share — sonda | **23.7%** | 23.7-23.7% |
| Flight Data share — satellite | **24.7%** | 24.7-24.7% |

Both medians land in the 20-35% target range. **Per the owner's rule, the economy is now
locked until Sprint 8's balance pass with real testers** — no further Flight Data/R&D
Lab/salary tuning without new evidence. The zero-variance-across-seeds caveat from the
v2.4 sweep still applies (the bot rarely gambles, so seed alone barely moves outcomes —
see that section above for why). Research stalls: unchanged, still exactly one
`basicEngineering` stall on day 1 for every seed — this is the accepted bootstrap-pacing
finding from v2.3/v2.4, not a new issue; v2.5's changelog explicitly accepts it and adds
NARRATIVE tooltip T-09 plus a contingent BACKLOG fix (see below), so no code action here.

## v2.6 — progressive disclosure (UI_SPEC §2b)

New default: hidden-until-relevant for building tiles, research nodes, ticker rows,
verbs, and panels. `BuildingDef` gained `teaser?: boolean` (`core/types.ts`, mirroring
CLAUDE.md's schema); `data/buildings.ts` sets it on Training Center only — v1's single
deliberate tease, per spec.

**Sprint 1 UI retrofitted where it actually conflicted — checked every §2b rule against
what Sprint 1 already built, only one did:**
- **Ticker** conflicted: it showed all 7 resource rows from the start. Retrofitted to
  show Funding only, revealing each other row the first time `lifetimeEarned > 0` for
  it (matches "each resource row appears the first time the player gains that
  resource"). Playwright-verified fresh load shows only "FUNDING"; screenshot in the
  session's smoke-check output. Added `Ticker.test.tsx` (3 tests) to lock this in.
- **Complex tabs** — already compliant (Sprint 0 built exactly the "all four visible,
  locked ones greyed with condition" rule this doc describes).
- **Campus building tiles** (Offices/Finance/R&D Lab/Crew Quarters) — no conflict: all
  four have `unlockCondition: { kind: 'start' }`, so showing them immediately already
  matches "appears once its own unlock condition is met." Training Center itself is
  NOT rendered anywhere in the Sprint 1 UI (Sprint 1's task list never included it) —
  that's a gap in coverage, not a conflict with the new rule, and adding a teaser tile
  for it now would be new construction rather than a retrofit. Left for whichever
  sprint builds out Training Center's presence.
- Staff panel role rows, research nodes, contracts panel, records board, manual-verb
  evolution (Funding Rounds/Rush Order) — none of these exist in the Sprint 1 UI yet,
  so nothing to retrofit; their progressive-disclosure rules apply when their sprints
  build them.

## Noted, no action taken (v2.5 changelog)

- **NARRATIVE T-09** ("R&D Lab built with zero Scientists available") — a Sprint-8 FTUE
  tooltip; the tooltip *system* doesn't exist yet, so nothing to wire up this sprint.
- **BACKLOG contingent FTUE fix** (a manual "Field observations" Research verb, activated
  only if Sprint 8 testers report day 1 feeling dead from the `basicEngineering` stall) —
  parked, explicitly not for v1 unless triggered later.

## Missing doc flagged: SPRINTS.md

`docs/SPRINTS.md` is absent from the repo entirely as of this doc-replacement pass (not
just stale — genuinely missing from `docs/`, confirmed via directory listing and a
repo-wide search for any misplaced copy). The other 6 replaced docs (GDD, ECONOMY_MODEL,
UI_SPEC, NARRATIVE_EVENTS, BACKLOG, CLAUDE.md) all landed correctly. Flagged to the owner
before starting Sprint 2, since SPRINTS.md is the authority on sprint order and scope —
proceeding without confirming its current content would risk exactly the kind of
unconfirmed-assumption mistake this project has twice already had to correct.

## Sprint 2 — Time engine & offline — COMPLETE (2026-07-25)

All 5 tasks done; acceptance verified (see below).

**Built:**
- `src/core/time.ts` — `startProcess`/`resolveProcesses`/`remainingMs`/`progressFraction`,
  all timestamp-resolved against a passed-in `now` (CLAUDE.md rule 6), parallel processes
  handled natively via array (no single-slot assumption). 7 tests.
- `src/core/economy.ts` — `resolveEconomyTick` gained an optional `rateMultiplier` (default
  1) so the online RAF tick and offline resolution call the literal same function at
  different rates, rather than two divergent implementations of "what a tick does."
- `src/core/offlineResolution.ts` — `resolveOffline`, chunked in 1-minute steps at
  `OFFLINE_RATE = 0.6` up to `OFFLINE_CAP_MS = 10h` (GDD/SPRINTS values), tracking a
  `PayrollStoppage` window if insolvency occurs mid-catch-up. 5 tests, including a
  clock-manipulation insolvency case.
- `src/state/telemetry.ts` — `trackEvent`/`trackFirstOccurrence`/`exportTelemetry`, an
  exportable local-first buffer (CLAUDE.md rule 11: no remote endpoint until Sprint 12).
  6 tests.
- `src/state/devTools.ts` — `useDevTools`, a tiny Zustand store holding the ×1/×60/×600
  time-warp multiplier. Applied at the call site in `main.tsx` (`deltaMs * warp`), not
  inside `core/tick.ts` itself, so the loop's delta measurement stays warp-unaware and
  the warp concept lives entirely behind `__DEV_TOOLS__`.
- `src/state/persistStore.ts` rewritten: `computeBootOffline()` now runs `resolveOffline`
  once at module load, producing both the boot `GameState` (resources caught up,
  `lastSeenAt` restamped) and a separate `useAwaySummary` store — deliberately outside
  `GameState` so `saveGame()` never serializes transient modal state into the save file.
- UI: `AwayModal` ("While you were away", gains + stoppage note, dismissible),
  `TimeWarpControl` (dev-only, `__DEV_TOOLS__`-gated), `ProcessProgress` (reusable
  progress-bar + remaining-time component; unit-tested but has no live consumer yet —
  confirmed against SPRINTS.md that the first process-producing gameplay action
  (research) doesn't land until Sprint 4, so this is infra-ahead-of-consumer by design,
  not a gap).

**Verification:**
- 82 unit/integration tests passing (up from 58 at Sprint 1 close). Typecheck, ESLint,
  production build all clean.
- Confirmed `TimeWarpControl` and all `time-warp` CSS classes are absent from the
  production bundle (`grep -c` on `dist/assets/*.js` → 0) — dev tooling stays dev-only
  per rule 11.
- Playwright smoke check (scratchpad-only install, per CLAUDE.md step 5): fresh load
  shows no away modal and the dev-only time-warp control; clicking ×60 activates it.
  Injected a save with `lastSeenAt` 1h in the past (via `page.addInitScript`, running
  before the app's own script, then a single `goto`) — the away modal appeared showing
  "You were gone for 1h 0m" with the correct Funding gain and no Research gain (R&D Lab
  unstaffable pre-Sprint-4, per Sprint 1's own scope note), dismissed cleanly, and the
  post-dismiss Funding matched the modal's number. Screenshot-verified the modal's
  multi-word copy ("While you were away") renders correctly, thousands-separator
  formatting intact on the gain figure. Zero browser console errors across both pages.
- **Found and fixed a test-methodology bug, not an app bug:** the first verification
  attempt injected the save into an *already-running* page via `page.evaluate()` then
  called `page.reload()`. That live page's own `beforeunload` autosave handler fired
  during navigation, flushing its stale in-memory (fresh) state back over my injection
  before the reloaded page ever read it — so every offline check showed 0 Funding and no
  modal, looking exactly like a broken offline resolver. Root-caused by noticing the
  post-reload `lastSeenAt` was suspiciously ~1h *later* than injected (i.e. "now", not
  "now − 1h"). Fixed by switching to `page.addInitScript()`, which runs before the app's
  own script on a fresh page with no prior live instance to clobber the injection.

**Scope notes:**
- `ProcessProgress` is built and tested but not yet wired into `BuildingTile` — verified
  via SPRINTS.md that no Sprint 0-2 gameplay action creates a `Process` (research is
  Sprint 4, certification is Sprint 5); wiring it into a tile now would be speculative UI
  for a system that doesn't exist yet. Sprint 4 is where this component gets its first
  real consumer.
- Away-summary display only ever shows Funding/Research gains (the two resources with
  passive production reachable in Sprint 0-2); the `AwaySummary` interface itself is
  general (any resource could appear), so no rework expected when later sprints add
  offline-relevant resources (Materials, Hardware, etc.).

## Sprint 2 addendum — edge-case review found and closed a real gap (2026-07-25)

Owner asked for explicit per-edge-case test confirmation before Sprint 3. Answering from
code/tests (not memory) surfaced that **process resolution was never actually wired into
either the online tick or the offline boot path** — `core/time.ts`'s `resolveProcesses`
existed and was unit-tested in isolation, but nothing called it, so a process could never
complete, online or offline, regardless of how much time passed. Invisible until now
because no Sprint 0-2 gameplay action creates a process (research is Sprint 4). Fixed,
not just flagged, since a passing test requires the wiring to exist:

- `core/offlineResolution.ts`: `resolveOffline` gained a `processes` parameter and now
  also calls `resolveProcesses(processes, now)` — against the real, **uncapped** `now`,
  independent of the resource offline cap, matching ECONOMY §11 ("processes at 100%").
  Returns `processes` (remaining) and `completedProcesses`.
- `state/persistStore.ts`: `computeBootOffline` now feeds `loaded.processes` in and
  writes the resolved `processes` back into `initialState`.
- `state/persistStore.ts` / `main.tsx`: `applyTick` now also resolves processes **online**,
  every frame — previously they'd only ever have advanced by reopening the tab. Time-warp
  (SPRINTS.md task 3: "applied at the timestamp layer... processes and economy accelerate
  consistently") is implemented by pulling each in-flight process's `startedAt` back by
  the warp *bonus* (`deltaMs * (warp - 1)`) each frame, then resolving against the real
  clock — the same `resolveProcesses` call offline resolution makes, no separate
  virtual-clock state to persist or drift.
- Reward/effect application on process completion is deliberately **not** implemented —
  no process kind has a defined payload or reward yet (that's Sprint 4 research, Sprint 5
  certification, etc. content); building a dispatcher now would mean inventing semantics
  ahead of the docs. `completedProcesses` is returned/available for whichever sprint adds
  that to consume.
- Separately, the same review caught a real latent bug while checking the "clock moved
  backward" edge case: `resolveOffline` initialized `payrollUnpaid` to a hardcoded
  `false`, so when zero time is applied (clock rewind, or a same-instant reload) an
  already-insolvent save would have its payroll-unpaid flag silently cleared without any
  actual resolution happening. Fixed by carrying forward the caller's
  `economyFlags.payrollUnpaid` as the starting value instead of assuming solvency.

**Edge-case test coverage (all in `src/core/offlineResolution.test.ts` unless noted):**

| # | Edge case | Test |
|---|---|---|
| 1a | Process completes mid-offline-window (parallel: one finishes, one doesn't) | `completes a process that finishes mid-offline-window, leaving a still-running parallel one untouched` |
| 1b | Insolvency begins mid-window; stoppage window reported | `reports a payroll-stoppage window once funding runs out, and stays unpaid to the end` (stoppage tracking) + `economy.test.ts`'s `pauses ALL staffed production and does not deduct salary when insolvent` (production-halt guarantee, reused verbatim per rule 6) |
| 1c | Insolvency already active at close persists, no partial offline recovery | `stays unpaid for the entire window when already insolvent at close, with no partial recovery` |
| 1d | Clock moved backward (lastSeenAt in the future); no negative elapsed, no double-grant | `clamps elapsed/applied time to 0 and leaves resources and processes untouched` + `does not silently clear an already-unpaid payroll when zero time is applied` (the bug fix above) |
| 1e | 10h resource cap vs. a 12h process — independent | `completes a 12h process at 100% even though the resource cap only applies 10h` |
| warp/processes | Time-warp reaches process completion, not just economy | `src/state/persistStore.test.ts`, describe block `applyTick — time-warp reaches process resolution (SPRINTS.md task 3)` (4 tests: no completion at x1, completion at x600, remaining-time check, and two parallel processes resolved independently through the real store's `applyTick` — the online-path counterpart to 1a's offline version) |

91 tests passing (up from 82), lint/build clean. `ProcessProgress`'s lack of a live UI
consumer (noted above) is unaffected by this — the queue now advances correctly
underneath it; a Sprint 4 research node is what will actually render it.

**CLAUDE.md updated** (owner, same pass): per-sprint workflow step 5 now states
acceptance is verified through the integrated path (real store, real resolution flow,
end to end), never by isolated unit tests alone — codifying the exact lesson from this
addendum (`resolveProcesses` unit-tested but never called) and echoing the Sprint 1/2
Playwright-methodology lesson: verification has to exercise the real path.
