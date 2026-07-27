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

## Sprint 2 acceptance — re-verified end to end through the real store (2026-07-25)

Per the new step 5 rule, re-checked all three Sprint 2 acceptance clauses through the
actual production code path (not isolated unit calls):

- **"Close 1h and return shows correct summary"** — re-ran the Playwright away-modal
  check after the `computeBootOffline` changes (it now also resolves the process queue).
  No regression: identical output to the original Sprint 2 verification (+3,672 Funding
  for a 1h gap), zero console errors. Screenshot: `11-reverify-away-modal.png`.
- **"Two parallel processes resolve correctly"** — already covered through the real store
  on both paths: offline via `resolveOffline` (the function `computeBootOffline` actually
  calls) in the 1a test, online via `useGameStore.getState().applyTick` (the function
  `main.tsx` actually calls every frame) in the new `resolves two parallel processes
  independently through the real store` test. Didn't duplicate this a third time in
  Playwright — `ProcessProgress` has no UI consumer yet (Sprint 4), so there's nothing
  further a browser check would add over the real-store test.
- **"A full simulated day runs in <3 min at x600"** — verified directly through the real
  running app: loaded a fresh save (Finance staffed, net rate 1.7 F/s), clicked the actual
  ×600 `TimeWarpControl` button, and let 150 real seconds elapse (`page.waitForTimeout`,
  not a computed estimate). Funding went from 1,001 to 154K — 1000 + 90,000 simulated
  seconds (25h) × 1.7 F/s ≈ 154,000, matching the prediction almost exactly. 25 simulated
  hours elapsed in 150 real seconds (under the 180s/3min bar, consistent with the math:
  24h × 3600s ÷ 600 = 144 real seconds for a full day). Zero console errors. Screenshot:
  `12-day-in-3min-x600.png`.

All three acceptance clauses hold through the integrated path. Sprint 2 is genuinely
closed; proceeding to Sprint 3.

## v2.7 — tick resolution order, starvation & contention (ECONOMY §4b, semantics only)

SPRINTS.md's "input-starved buildings pause with indicator" and the Fabrication/Refinery
Materials-contention case weren't specified anywhere — two genuine mechanic ambiguities,
flagged before writing any Sprint 3 code rather than guessed at. Owner decisions, codified
in ECONOMY_MODEL.md v2.7 §4b (no values touched, economy lock unaffected):

- **Starvation: binary pause.** A consumer gets its full tick requirement or produces
  zero that tick — never partial, never negative. Same pattern as payroll insolvency,
  scoped per building. Self-recovers the instant inputs suffice.
- **Contention: fixed order, not proportional.** Salaries first (insolvency check), then
  pure producers (Finance, Supply Depot, R&D Lab), then consumers claiming in §4 table
  order top to bottom (v1: Fabrication, then Refinery). Staffing is the priority lever by
  design (an unstaffed consumer neither produces nor claims) — no priority UI in v1.
  Offline resolution uses the identical functions (rule 6).
- **UI hysteresis:** the starved indicator appears immediately, clears after 3000ms of
  consecutive fed time — not 3 calls to the resolution function, since online (per-frame)
  and offline (1-min chunks) call it at wildly different granularities. Tracked as
  accumulated simulated ms (`fedStreakMs`), not a raw tick counter, so it means the same
  thing regardless of caller.

## Sprint 3 — Full production — COMPLETE (2026-07-25)

All 5 tasks done; acceptance verified (see below).

**Built:**
- Schema (v1→v2 migration, in the same commit per rule 5): `BuildingState` gained
  `starvedIndicator`/`fedStreakMs`. `CLAUDE.md`'s schema block updated to match.
- `src/core/hardware.ts` (new) — `currentHardwareTier` (aluminum until the 'titanium'
  tech id is completed, matching the established camelCase-tech-id-ahead-of-Sprint-4
  convention), `creditHardware` (tier-aware grant, sum(byTier) === amount kept in sync),
  `hardwareAtOrAboveTier`/`spendHardware` (the "cost checks support minTier" capability —
  wired into `canAffordCost`/`payCost` in `core/actions.ts`, but no Sprint 0-3 building
  actually sets `minHardwareTier` yet, so it's infra-ahead-of-content, same restraint as
  Sprint 2's `ProcessProgress`: unit-tested directly, no live consumer to integrate
  against until a later sprint's tier-gated cost exists).
- `src/core/staff.ts` gained `buildingStaffRatio` — the overall ratio for a
  possibly-multi-role building (Fabrication: 1 Eng + 1 Tech) as the MINIMUM across its
  required roles (a bottleneck: needs every role staffed, not an average). Not specified
  numerically anywhere in ECONOMY §4 — flagged as the only sensible reading of "requires
  both" rather than re-asking, unlike the two starvation/contention questions that had
  genuinely multiple plausible answers. Replaces `BuildingTile`'s old `roles[0]`
  placeholder (silently wrong for any multi-role building, never exercised until now).
- `src/core/economy.ts` — `resolveEconomyTick` rewritten to ECONOMY §4b's fixed order:
  salaries → pure producers (Finance, Supply Depot, R&D Lab) → consumers in table order
  (Fabrication, Refinery), each via `resolveConsumer` (binary claim-or-starve) and
  `updateStarvation` (the hysteresis state machine). Returns `buildings` now, not just
  `resources` — threaded through both `core/offlineResolution.ts` (`resolveOffline` gained
  `completedTech`/kept `buildings` round-tripping through the chunk loop) and
  `state/persistStore.ts` (`computeBootOffline`, `applyTick`).
- `src/core/actions.ts` — `applyGatherMaterials` (free, one-time, Supply Depot lv1+) and
  `applyRushOrder` (150 F → 100 M, Fabrication built) — cooldowns are UI-only, matching
  Pitch's established pattern, not a core-level restriction.
- UI: `ComplexTabs` is now store-driven (Production unlocks live at 300 lifetime Funding;
  previously hardcoded `unlocked: false` regardless of state — Complex B was actually
  unreachable in the UI before this sprint even though the data/unlock-condition existed).
  `BuildingTile` shows a "— STARVED" indicator for consumer buildings and now uses
  `buildingStaffRatio` for its rate display. New `ManualActionButton` (generalizes
  PitchButton's cooldown+feedback shape) powers Gather Materials and Rush Order, rendered
  conditionally on each tile once unlocked (progressive disclosure, per v2.6).

**Verification:**
- 117 unit/integration tests passing (up from 91 at the Sprint 2 addendum), including:
  fixed-order + binary starvation + hysteresis (economy.test.ts), the owner-suggested
  oscillation case (Fabrication runs full-rate consistently while Refinery starves
  consistently across 5 ticks — not alternating/flickering, proving the fixed claim order
  rather than assuming it), Hardware tier crediting with the sum(byTier)===amount
  invariant, the owner-suggested offline/online starvation parity test (same oscillation
  scenario resolved through `resolveOffline` at the 60% rate — every quantity scales
  together so the fed/starved pattern is rate-invariant), and the v1→v2 migration.
  Typecheck, ESLint, production build all clean; dev-only `TimeWarpControl` confirmed
  still absent from the production bundle.
- `sim/run.ts` re-run (human + optimal, seed 1, 10 days) — no regression: Complex B
  unlocks and gets built via the sim's pre-existing (and already fixed-order-correct)
  bot logic, day-5 pacing floor still passes, Flight Data shares (23.7%/27.9%
  sonda/satellite) land within single-seed variance of the locked 23.7%/24.7% medians.
  No ECONOMY_MODEL.md value touched this sprint — the lock holds.
- Playwright, through the real store per the new CLAUDE.md step-5 rule: fresh load shows
  Production locked; pitching to exactly 300 lifetime Funding unlocks it live; all 5
  Complex B tiles render with correct names (screenshot-verified "Propellant Depot" as
  the multi-word/edge-case label); built Supply Depot, hired and assigned a Technician
  via the tile's own stepper, clicked Gather Materials and confirmed the Materials ticker
  row appeared (progressive disclosure, v2.6) and read 5/200 with the "+5 M" feedback
  captured mid-animation. Zero console errors.

**Scope notes:**
- Gather Materials/Rush Order aren't wired into the sim's bot policy — the sim already
  reasonably approximates Complex B (buildings, fixed production order, generic
  hiring/staffing) from earlier groundwork, and adding the two new manual verbs would
  mean threading a new stat through the CSV reporting pipeline for a supplementary
  realism enhancement, not something needed to validate §4b's mechanics. Left for if a
  later balance pass finds Supply Depot's passive rate alone insufficient.
- `minHardwareTier` cost-checking is real, tested machinery (`hardwareAtOrAboveTier`,
  `spendHardware`, wired into `canAffordCost`/`payCost`) with no current building or
  upgrade that sets it — same "infra now, content later" pattern as Sprint 2's
  `ProcessProgress`, not a gap.
- Hardware-costed purchases before this sprint (e.g. a future Test Stand build) will now
  correctly deduct from `byTier` via `spendHardware` instead of the old flat-`amount`-only
  `payCost` path — a latent invariant bug (`sum(byTier) !== amount` after any hardware
  spend) that happened to never be exercised yet, closed as part of the same cost-check
  wiring rather than left for whichever sprint first spends Hardware.

## v2.8 / "Sprint 3.5" — owner manual-play findings (2026-07-26)

First manual play session surfaced four items, addressed before Sprint 4. Two doc rules
landed alongside the owner's decisions: ECONOMY §4 ratifies the Sprint 3 bottleneck
staffRatio and adds "slots exist only at level >= 1"; UI_SPEC §4 adds the no-abbreviation
and cooldown-feel rules.

**1. Dev-only reset button.** `DevResetButton` (gated behind `__DEV_TOOLS__`, mirrors
`TimeWarpControl`) wipes the save and reloads. Found and fixed a real race while building
it: `localStorage.removeItem()` immediately followed by `location.reload()` isn't enough
— reload fires `beforeunload`, and the autosave handler calls `saveGame()` with the
current (pre-reset) in-memory state, silently resurrecting the save before the reloaded
page ever reads it (the same class of bug Sprint 2's away-modal Playwright check hit).
Fixed with a module-level guard (`resetInProgress`) that makes `saveGame()` a no-op once
`hardResetSave()` has fired. Regression test in `persistStore.test.ts` (placed last in
the file deliberately — the guard has no reset hook, mirroring how only a real reload
clears it in production, so it would break every later `saveGame()`-dependent test in the
same file if it ran earlier).

**2. Killed the abbreviation leak.** Audited every label: `Ticker`, `AwayModal`, and
`PayrollBanner` were already compliant (full names throughout). `BuildingTile` (cost
labels, production rate suffix) and `StaffHiring` (hire button cost) were not — both used
a `RESOURCE_ABBR` map ("150 F", "2.0/s F"). Replaced with `data/resourceNames.ts`'s
`RESOURCE_NAME` (single source of truth for the full display name, now shared by every
consumer). Manual-action feedback ("+5 M") switched to bare numbers ("+5"), matching
Pitch's own pre-existing convention rather than inventing a new short-name format.

**3. Fixed the level-0 assignment bug.** `buildingSlotCount`/`staffRatioForBuilding`/
`buildingStaffRatio` all gained a `level` parameter and return 0 below level 1 — an
unbuilt building has no slots, full stop. `adjustStaffAssignment` threads the building's
level through and refuses assignment accordingly; `BuildingTile` doesn't render
assignment rows at all for an unbuilt building (roles list is empty below level 1), so
there's no dead stepper to click in the first place. Economy output was never actually
wrong (the `* level` factor in `productionPerSecond` already zeroed production
regardless), but the assignment STATE itself was — staff could sit "assigned" to a
building that could never produce, occupying a slot that shouldn't have existed and
blocking that hire from being assigned somewhere real. `hireStaff` is untouched, per the
explicit instruction: hiring ahead of building is a legitimate choice, salary burn is its
real cost.

**4. Pitch cooldown feel.** `ManualActionButton` gained a visible recharge fill
(CSS animation, duration = the cooldown) and a shake when a click lands during cooldown
— UI_SPEC §4's "must read as rhythm, never a dead button." This required removing the
button's native `disabled` attribute during cooldown specifically (a disabled element
never receives the click that needs acknowledging); unaffordable/locked states still use
native `disabled` via the separate `disabled` prop, so that distinction is preserved.
Consolidated `PitchButton` to use `ManualActionButton` under the hood (added callback-form
`feedbackText` support for Pitch's level-dependent yield) rather than duplicating the same
cooldown-feel logic twice — Gather Materials and Rush Order get the identical treatment
for free, satisfying UI_SPEC §4's general rule rather than just Pitch's specific mention.

**Process note — a rule-1 violation, corrected going forward:** the multi-role bottleneck
staffRatio (Sprint 3) was implemented and only flagged afterward, unlike the starvation/
contention questions from the same sprint, which were correctly asked upfront. The owner
ratified the pick but named the process gap: an undefined mechanic case is a stop-and-ask
regardless of how confident the implementation is that only one answer makes sense. Saved
to memory (`feedback_stop_and_ask_on_docs.md`) so future undefined-mechanic cases get
batched into the same upfront question as any other open ambiguity for that piece of work.

**Verification:** 120 tests passing (up from 117), including the level-0 assignment
regression and the reset-race regression. Typecheck/lint/build clean; dev-only
`DevResetButton` confirmed absent from the production bundle. Playwright, through the
real store: Fabrication shows 0 assignment rows unbuilt, 2 once built; the Fabrication
upgrade button reads "Upgrade (350 Funding + 100 Materials)" and Rush Order reads
"Rush Order (150 Funding)" — zero single-letter abbreviations found in a full-page text
scan; the recharge overlay is present immediately after a Pitch click and gone once the
cooldown elapses; a click landing during cooldown reliably shakes (confirmed via an
isolated timing check after the first combined run raced its own assertion — Playwright
checking a `requestAnimationFrame`-deferred class update on the very next synchronous
line, not a product bug); the reset button shows its confirm dialog, wipes the save, and
reloads to a genuinely fresh 0 Funding state. Zero console errors throughout.

**Deferred, no action:** SPRINTS.md's Sprint 11 gained "contextual job titles" (per-
building flavor titles on staff slots, presentation-only, roles/data untouched). Noted for
when that sprint starts.

## v2.9 — Aluminum research node disambiguated (ECONOMY §5, Sprint 4 blocker)

ECONOMY §5 listed "Aluminum (25 R, 5 min)" as a research node, but §1's starting state
already gives Hardware "0 (Aluminum tier)" with no tech required — flagged rather than
guessed at, since either reading (stale doc row vs. a real node with an undocumented
effect) would materially change `data/researchTree.ts`. Owner ruling: Aluminum is NOT a
tier gate (Sprint 3's `currentHardwareTier` assumption ratified, unchanged); the node
stays, renamed "Aluminum alloys," with an explicit `effects: []` — its only functions are
Titanium's prerequisite and the Materials branch's entry node (without it the branch
would show a single unreachable 400 R node all era one, hidden by UI_SPEC §2b's
progressive disclosure). A contingent future effect (small Fabrication bonus) is parked
in BACKLOG.md, not implemented — it needs an explicit economy unlock.

## Sprint 4 — Research — COMPLETE (2026-07-26)

All 5 tasks done; acceptance verified (see below).

**Built:**
- `src/data/researchTree.ts` (new) — all 15 nodes across 4 branches (Materials,
  Propulsion, Operations, Program), ids/costs/durations/deps matching `sim/run.ts`'s
  pre-existing model exactly (built ahead of this sprint) — the sim now imports this
  file instead of keeping its own parallel copy. Only Basic logistics and Remote Ops
  declare a numeric `effect`; a `description` field is populated ONLY where directly
  verified against real code/data (a modifier, a `ROLES.unlockTech` match, or a
  `BuildingDef.unlockCondition` match) — e.g. `soundingRockets`/`probe1Engine`/
  `vabQueues`/`autoRefuel`/`orbitalFlight` have none, since nothing in the current
  codebase concretely defines what they unlock yet (that's Sprint 5+ certification/VAB
  content) and inventing a plausible-sounding claim would violate rule 1. (Caught one
  near-miss here: Launch Rail is actually gated by `testStand` tech, not
  `soundingRockets` as first assumed — verified against `data/buildings.ts` before
  writing any description text, not from memory.)
- `src/core/modifiers.ts` (new) — `applyModifiers`/`registerModifier`, the central
  system CLAUDE.md rule 4 has required since day one. v1 only ever registers one
  modifier per target; composition order for multiple simultaneous modifiers on the same
  target is explicitly left undecided (documented in the module comment), deferred to
  whichever future sprint actually needs it — not designed ahead of that need.
- `src/core/research.ts` (new) — `isNodeAvailable`/`isNodeVisible` (UI_SPEC §2b: visible
  if available/done, or if every dep is itself completed-or-available — the reveal front
  extends exactly one ring past the completed frontier) and `resolveResearch` (timestamp-
  based, same pattern as every other timed thing in this codebase; "one node at a time"
  means it never auto-starts the next node even if an offline gap runs well past the
  current one's duration).
- `src/core/actions.ts` gained `startResearch`, `startPromotion`, `buyInternalUpgrade`
  (a real gap closed in passing — `BuildingDef.internalUpgrades`, e.g. Crew Quarters'
  Classroom, had no purchase path in the UI at all before this sprint, since nothing had
  needed one yet), and `applyCompletedProcesses` — the process-completion dispatcher
  Sprint 2/3 deliberately left unbuilt ("no process kind has a defined payload yet").
  Sprint 4 gives `'training'` (promotion) its first real effect; other kinds remain
  unhandled until whichever sprint defines their payload.
- Promotion (`data/roles.ts`'s new `PROMOTIONS` table: Tech→Eng 100 F/15 min, Eng→Sci
  300 F/45 min) is gated ONLY by the Classroom upgrade, never by the target role's
  direct-hire tech — ECONOMY §3's explicit bootstrap rule (zero Scientists, zero tech:
  hire Technicians, promote your way to the first Scientist). The promoted unit leaves
  its `from` pool immediately (paid, "in training") and only joins `to` on completion.
- Wired into both paths per rule 6: `applyTick` resolves research (with the same
  warp-shift trick processes already use) and applies completed-process effects every
  frame; `computeBootOffline` does the same for an offline gap, plus queries
  `applyModifiers` for the Remote Ops offline-cap bonus before calling `resolveOffline`.
- UI: `ResearchPanel` (4 branch columns, node cards, locked/available/in-progress/done
  states, a progress ring via `conic-gradient`), `PromotionPanel` (hidden entirely until
  the Classroom exists), and generic internal-upgrade rendering added to `BuildingTile`.
  Extracted a `useNow()` hook so the live countdown re-renders only the specific active
  node/header — not the whole panel (rule 10) — and consolidated three separate
  `ROLE_LABELS` copies (BuildingTile, StaffHiring, and the new PromotionPanel) into one
  `data/roles.ts` export, catching a real abbreviation leak in the process (see below).

**Verification:**
- 150 tests passing (up from 120), typecheck/lint/build clean. `sim/run.ts` re-run
  (human + optimal, seed 1) after consolidating its research tree onto the shared file —
  byte-identical output to before (23.7%/27.9% Flight Data shares, day-5 pacing floor
  PASS), confirming zero behavioral drift from the refactor. Also fixed a pre-existing
  (not something this sprint introduced — confirmed via `git log`, untouched since the
  very first commit) TypeScript null-narrowing gap in `sim/run.ts` that only surfaced
  once this sprint's edits forced a full recheck of that file.
- Playwright, through the real store, end to end: fresh load shows all 4 branches' entry
  nodes available and their immediate dependents visible-but-locked ("Requires: X"),
  everything two-or-more steps out fully hidden. Bootstrapped from zero — pitched,
  built Crew Quarters + Classroom, hired 2 Technicians, promoted Technician→Engineer→
  Scientist (using ×600 time-warp only for the pure-wait windows, switched back to ×1
  before any further clicking — see the methodology note below), built R&D Lab, assigned
  the Scientist, waited for Research to accumulate, started and completed "Aluminum
  alloys," and confirmed Titanium correctly flipped from locked to available with its
  real effect text showing. Zero abbreviation leaks in a full-page text scan, zero
  console errors.
- **Playwright methodology, not a product bug (third time this project has hit this
  category — Sprint 2's away-modal race, Sprint 3.5's reset-button race, now this):**
  the first combined verification attempt used ×600 warp continuously through paced,
  human-speed clicking (pitching at ~1s intervals). Salary drains at the warp multiplier
  for as long as warp is engaged, not just for a process's own duration — 0.75 F/s
  (Technician + Scientist) × 600 = 450 F/s, which a 10 F pitch every ~1s real time
  cannot outrun. This produced an apparent insolvency-adjacent freeze that looked exactly
  like a production bug (Research barely accumulating) until root-caused: fixed by
  switching warp to ×1 for all paced clicking, engaging ×600 only for pure wait-on-a-
  timer windows, then immediately reverting — the same "verification must exercise the
  real path, and the real path includes real timing interactions" lesson as the prior
  two, just with time-warp as the new variable in the mix.

**Scope notes:**
- The Aluminum-tier ambiguity (v2.9, above) is the second time in two sprints an
  undefined-or-ambiguous case was correctly flagged before writing code, following the
  process-gap lesson from Sprint 3's staffRatio (see feedback memory).
- Contingent Aluminum-alloys effect and the "VAB queues"/"Auto-refuel"/propulsion-branch
  nodes' concrete effects remain undefined by design — infra (the tree, the resolution
  logic, the modifier system) is ready for whichever sprint defines them, matching the
  established "build the mechanism, not speculative content" restraint from Sprints 2-3.

## Design review (2026-07-26) — 8 findings, all ruled on, docs replaced to v3.1

A full read-through of all 6 docs plus outside research (idle-game design literature,
real sounding-rocket programs) surfaced 8 concrete issues, reported to the owner without
touching any doc or code. All 8 were ruled on and landed directly in GDD/ECONOMY/
NARRATIVE/UI_SPEC/SPRINTS/CLAUDE.md v3.1 (owner-authored, not this session's edit).
Recorded here so the relevant future sprint doesn't have to rediscover them:

1. **Modifier.expiresAt** — done now, see below.
2. **Event preconditions** — NARRATIVE §3 general rule: every event declares one;
   absence is a spec error. E-04 now requires ≥1 Scientist already hired/promoted (it
   accelerates the promotion bootstrap, never skips it); E-01 requires Refinery built;
   E-02/E-05/E-06 require Complex B. **Sprint 9's `core/events.ts` must check these before
   rolling any event** — not implemented yet, no event code exists.
3. **Tier-0 contract Confidence** — uses the sonda formula (§7a), 100% reachable with
   extended cert, same as a story S-1. Only satellite tiers are the real gambling space.
   **Sprint 6/9 relevant** — tier-0 confidence math must route through the sonda formula,
   not a separate contract-Confidence path.
4. **Reputation gates on satellite contracts** — SCOPED economy unlock (not a general
   relock): tier 1 ≥ 20 Rep, tier 2 ≥ 50 Rep, both framed as safety nets (clean play
   accumulates ~105 Rep by Aurora I) rather than pacing gates. **Sprint 9 must sim-verify
   they never bind under clean play**, same check as Pad B's existing ≥40 gate.
5. **Clean Room** — resolved as a real tier-2 prerequisite (the VAB upgrade), not a
   naming coincidence; the tier itself is renamed "constellation batches" to end the
   collision. **Sprint 9's contract-tier gating must check for the upgrade, not just
   Hardware tier.**
6-8. **Doc hygiene** — GDD §9 and SPRINTS Sprint 10 no longer cite "VAB queues" (a
   research-tree node, already shipped Sprint 4) as an XP-tree mechanic-changer; GDD §5
   dropped "express re-certification" (never had a node); E-01 gated per #2 above.

**Lower-urgency, applied when convenient (before Sprint 8), not yet done:** `sim/run.ts`
needs a third `casual` profile (~30 min/day) and a pacing-ceiling flag (human > day 12).
Both instrumentation only — no ECONOMY_MODEL values change. Noted here as a standing
task; will land before Sprint 8 per the owner's instruction, not blocking Sprint 5-7.

## v3.1 — Modifier.expiresAt — COMPLETE (2026-07-26)

The one design-review item with an immediate code consequence (E-05's temporary "+10%
process duration for 2h" needs a modifier that can expire; nothing else from the review
touches Sprint 0-4 code, since contracts/events/XP-trees don't exist yet).

**Built:**
- `src/core/types.ts`: `Modifier` gains `expiresAt?: number` (epoch ms, absent =
  permanent), matching CLAUDE.md's v3.1 schema exactly.
- `src/core/modifiers.ts`: `applyModifiers` gains a required `now` parameter (rule 6:
  /core never reads the clock itself) and filters out any modifier whose `expiresAt <=
  now` at query time, even if it hasn't been pruned from the array yet. New
  `pruneExpiredModifiers(modifiers, now)` drops expired entries outright.
- `src/state/persistStore.ts`: pruning wired into all three places CLAUDE.md's contract
  names — `loadGame()` (prunes right after migrating), `saveGame()` (prunes before
  writing), and `computeBootOffline()` (prunes again against the POST-GAP `now`, so a
  modifier that expired partway through an offline gap can't survive into the fresh boot
  state just because it was still alive at the moment of load). `applyModifiers`'s call
  site for the offline-cap modifier now passes `now` through.
- Deliberately did NOT thread `modifiers` through `resolveOffline`'s own signature —
  `computeBootOffline` is already the established composition point where modifiers get
  queried against offline state (the existing `offline.capMs` modifier query works the
  same way, not inside `resolveOffline` itself), so pruning at the same point keeps the
  architecture consistent instead of widening `resolveOffline`'s already-9-parameter
  signature and rewriting its 11 existing tests for a capability Sprint 9 is what
  actually exercises.

**No schema migration / no `CURRENT_SCHEMA_VERSION` bump.** `expiresAt` is optional and
"absent = permanent" is exactly what every existing saved modifier already means — old
data is already valid under the new type with no transformation needed, unlike Sprint 3's
`starvedIndicator`/`fedStreakMs` (required fields needing an explicit default backfill,
which is what actually required v1→v2). Flagging this reasoning explicitly rather than
assuming it's obviously right, since CLAUDE.md rule 5 reads unconditionally ("schemaVersion
bumps with every schema change") — happy to add a no-op v2→v3 migration if the intent was
stricter than "no old save can silently misbehave."

**Verification:** 158 tests passing (up from 150 at Sprint 4 close) — new coverage in
`modifiers.test.ts` (expiry at/before/after the boundary, permanent modifiers unaffected,
`pruneExpiredModifiers` itself) and `persistStore.test.ts` (load prunes, save prunes
independently of load). Typecheck (`tsc -b`), lint, and production build all clean.
`sim/run.ts` re-run (unaffected — no economy value or sim code touched): human profile
still reaches Aurora I on day 5, pacing floor **PASS**; salary ratio 54.2-55.0% across the
5 checkpoints (target 30-55%); Flight Data share 23.7% sonda / 25.0% satellite (target
20-35%) — consistent with the locked v2.5 economy, no drift.

**Two issues found while verifying the v3.1 doc replacement against actual code/state —
flagged, not resolved, per "doc ambiguity = stop and ask":**

1. **CLAUDE.md schema regression:** the v3.1 replacement's `GameState.buildings` line
   reverted to `Record<BuildingId, { level: number; upgrades: string[] }>`, dropping the
   `starvedIndicator`/`fedStreakMs` fields (and the `BuildingState` interface itself) that
   Sprint 3/v2.7 added via a real, tested v1→v2 migration and that `core/economy.ts`
   currently depends on for the starvation-hysteresis indicator. Code was left exactly as
   it is (untouched) — did not delete the fields to match the doc, since that would break
   a tested, shipped mechanic on a doc discrepancy that looks like it came from replacing
   CLAUDE.md against an older base rather than a deliberate decision to remove starvation
   tracking.
2. **Undisclosed "v3.0" doc content:** `ECONOMY_MODEL.md` and `UI_SPEC.md` both carry a
   "v3.0 changes" entry (predating v3.1) — a full cost-rendering overhaul (icon+number for
   costs, `$` prefix for Funding/"Funds", no resource nouns in price tags, explicitly
   *replacing* the v2.8 "no abbreviations" rule the current UI is built and tested
   against) plus a new UI_SPEC §2c "active process strip" and a staff-availability chip
   per complex tab. None of this was part of the design-review conversation. It isn't
   assigned to any SPRINTS.md task, and it directly conflicts with how every existing
   screen (`BuildingTile`, `StaffHiring`, `ManualActionButton`, `PromotionPanel`) currently
   renders costs — which convention Sprint 5's new UI (Test Stand costs, certification
   process display) should follow is now genuinely ambiguous. Not touched; flagged for the
   owner before Sprint 5's UI step specifically, since Sprint 5's core/data work doesn't
   depend on the answer but its UI step does.

## Both flagged items resolved by the owner (2026-07-26)

CLAUDE.md and SPRINTS.md replaced again: `BuildingState` restored in CLAUDE.md's schema —
reconciled field-for-field against `src/core/types.ts`'s shipped `BuildingState`
(`level`, `upgrades`, `starvedIndicator`, `fedStreakMs`, same order) and it matches
exactly, so no code or doc correction was needed beyond confirming the match. New rule 5b
codifies "diff a replacement doc against the repo first; if it drops something shipped
code depends on, keep the code and flag it" — the process this pass already followed.
The "v3.0" content is a real, owner-authored addendum from manual play (untrackable
promotion timer, staff invisible outside Campus, "400 Funding" reading wrong as a price)
that got lost in an earlier compact; it now has an explicit owner, **Sprint 4.5 —
Presentation conventions**, scheduled to run before Sprint 5's UI step so nothing gets
built twice against the old convention. Sprint 5 order of work, per the owner: (a)
core/data now, unblocked; (b) Sprint 4.5 in full; (c) Sprint 5's UI, on the new
convention from the start. Rule 5 also now states explicitly that an additive optional
field needs neither migration nor version bump — ratifying the `expiresAt` call, noted
here rather than revisited case by case going forward.

## Sprint 5 (core/data portion) — Testing, certifications, scripted failure (2026-07-26)

Per the owner's ordering above, only the core/data slice of Sprint 5 lands now — the
Mission Log feed component, `data/narrative.ts`, and any certification-triggering UI are
held for after Sprint 4.5 (they're new UI surfaces; certification buttons in particular
would render costs, which is exactly what Sprint 4.5 is about to change). What's built
here is real, tested, and reachable through the actual store — just not yet clickable
from a certification-specific button, mirroring the established "infra ahead of
consumer" pattern (Sprint 2's `ProcessProgress`, Sprint 3's `minHardwareTier`).

**Built:**
- Schema (v2→v3 migration, same commit per rule 5): `EngineId` (`'probe1'|'orbital1'` —
  Orbital-1 listed now, Sprint 7 content only, so it never needs its own migration later,
  same precedent as `PadId`/`HardwareTier`), `EngineCertificationState`
  (`attempted`/`certified`/`extendedCertified` — deliberately generic, not
  Probe-1-specific: `attempted` covers both Probe-1's scripted-failure test 1 AND
  Orbital-1's future probabilistic attempt, since both gate a "retry" the same way).
  `GameState` gains `certifications: { engines, inProgress }`, same shape/pattern as
  `research`. CLAUDE.md's schema block updated to match, same commit.
- `src/data/certifications.ts` (new) — Probe-1's three tests (`probe1Test1`/`Test2`/
  `Extended`) per ECONOMY §6 v2.5 values, each tagged `stage: 'first'|'retry'|'extended'`
  (generic sequencing vocabulary, not test-id-specific, so Orbital-1's future
  probabilistic first/retry shape can reuse the same field).
- `src/core/certification.ts` (new) — `isCertificationTestAvailable` (mirrors
  `core/research.ts`'s `isNodeAvailable` shape) and `resolveCertification` (timestamp-
  based, one test in progress at a time, same pattern as `resolveResearch`). Probe-1's
  three outcomes are resolved directly by `stage` rather than through a generic
  probabilistic-outcome abstraction — deliberately not generalized for Orbital-1's actual
  80%-chance certification (a committed roll, rule 12) since Probe-1 alone is entirely
  deterministic (GDD §7: "the FIRST static fire ALWAYS fails") and doesn't need that
  machinery yet.
- `src/core/hardware.ts` — `creditHardware` gained an `oneTime` parameter (default
  `false`, so Fabrication's existing call site is unaffected): the scripted failure's
  6H recovery is a reward, not passive production, so it ignores the cap like every other
  one-time grant (GDD §1c) rather than silently capping mid-recovery.
  `core/actions.ts` gained `startCertification` (afford-check, cost deduction, process
  creation — the same shape as `startResearch`).
- `src/core/unlockConditions.ts` (new) — `isUnlockConditionMet` finally gives
  `BuildingDef.unlockCondition` real teeth: it's been on every `BuildingDef` since Sprint
  0 but nothing ever evaluated it generically (Complex B's tab unlock was hand-coded to
  its one specific condition, Complex C/D were hardcoded `false`). `auroraISuccess` is
  derived from `mission.launches` (no dedicated flag needed — `LaunchRecord` already
  carries `missionType`/`success`).
- **Found and fixed the same bug class Sprint 3 fixed for Complex B:** `ComplexTabs.tsx`
  had Testing/Launch both hardcoded `unlocked: false` regardless of state — Testing was
  genuinely unreachable no matter how much tech got researched. Fixed Testing to be
  state-driven (`research.completed.includes('testStand')`). **Left Launch hardcoded-
  locked on purpose**: its tech gate (`flightProgram`) is already technically reachable
  since the Program branch is complete, but Complex D has no panel content until Sprint 7
  builds VAB/Pad/Launch Control/Tracking Station — making the tab state-driven now would
  unlock it onto a blank screen for a sufficiently-researched player. Sprint 7 is where
  this becomes state-driven, matching Testing today.
- `src/App.tsx` gained `TestingPanel` (Test Stand + Launch Rail tiles via the existing,
  unmodified `BuildingTile`; Payload Processing conditionally rendered via
  `isUnlockConditionMet` — stays hidden, since nothing sets `auroraISuccess` yet,
  correctly matching UI_SPEC §2b's "stays hidden until Aurora I success").
- `src/state/persistStore.ts` — certifications wired through both paths per rule 6:
  `computeBootOffline` resolves any in-progress test across an offline gap (same
  dedicated-slot pattern as research); `applyTick` applies the same warp-shift trick
  processes/research already use. **Found and fixed a real gap while wiring this in:**
  the away-summary's `researchGained` compared `offline.resources` (before certification
  resolution), so a certification completing during an offline gap would have its Flight
  Data silently missing from the "While you were away" summary math — fixed to compare
  against `certificationResolution.resources` instead. New `startCertificationTest` store
  action.

**Verification:**
- 192 tests passing (up from 158), typecheck/lint/build clean, dev-only tooling confirmed
  still absent from the production bundle (`grep -c` on `dist/assets/*.js` → 0).
  `sim/run.ts` re-run (untouched by this work) — no regression: day-5 pacing floor still
  PASS, Flight Data shares unchanged (23.7%/25.0% sonda/satellite).
- Playwright, through a real browser: confirmed the Testing tab is genuinely locked on a
  fresh save. **Found a real methodology trap of my own making, caught before it produced
  a false "broken" report:** the first verification attempt tried to reach `testStand`
  the same way Sprint 4 bootstrapped to a Scientist — real clicks, then a single ~50s
  real-time `warpWaitThenReset` to bank enough Research at the Lab's tiny 0.03 R/s base
  rate. That's exactly the anti-pattern `feedback_verification_timing_traps.md` already
  warns about: 50 real seconds at ×600 is 8+ virtual hours, and salary drains at the warp
  multiplier for the entire window (450 F/s with 1 Technician + 1 Scientist) — insolvency
  hit partway through and paused the Lab along with everything else, banking only 34 R
  instead of the expected ~450. Rather than re-tuning the economy of a script whose actual
  goal was DOM reactivity (not re-proving the bootstrap economy, which is already fully
  covered by `core/certification.test.ts` and the real-store tests in
  `persistStore.test.ts`), switched to the same `page.addInitScript()` localStorage-
  injection technique Sprint 2's away-modal check established: inject a save with the
  Program branch already researched, then verify the UI reacts correctly to real state.
  Confirmed: Testing tab unlocks the moment `testStand` is in `research.completed`;
  "Engine Test Stand" and "Launch Rail" tiles render with correct costs; Payload
  Processing stays hidden; Launch stays locked; the Materials branch showing "Aluminum
  alloys" as a real node (not just an empty save being ignored) confirms the injected
  state genuinely loaded. Screenshot-verified both the tab bar and the panel itself
  (`24-sprint5-testing-tab.png`, `24-sprint5-testing-panel.png`). Zero console errors.

**Scope notes:**
- SPRINTS Sprint 5 tasks 1-3 and 5 (Test Stand reachability, certifications as processes,
  scripted failure, Flight Data wiring) are done at the core/data/minimal-reachability
  level. Task 5's "Flight Experience visible as a resource" is satisfied for free by the
  existing generic `Ticker` (already iterates every `ResourceId` and reveals a row once
  `lifetimeEarned > 0` — no code change needed, confirmed by `core/certification.test.ts`
  crediting `flightxp` correctly).
- Task 4 (Mission Log feed component + `data/narrative.ts`) is NOT started. It doesn't
  strictly depend on the cost-rendering convention question (narrative entries are text
  pulled by ID, not price tags) — flagging that in case the owner would rather pull it
  forward — but it wasn't in the owner's explicit "start there" list, so it's held for
  after Sprint 4.5 along with the certification-triggering buttons, pending confirmation.
- Sprint 5 is NOT closed: its acceptance criterion ("full test-fail-narrative-retry-
  certify flow works and is narrated") needs the narration and the trigger UI, both
  deliberately deferred. Proceeding to Sprint 4.5 next, then back to finish Sprint 5's UI.

## Sprint 4.5 — Presentation conventions — COMPLETE (2026-07-26)

Five docs replaced (NARRATIVE_EVENTS, ECONOMY_MODEL, UI_SPEC, BACKLOG, SPRINTS) after
the owner's manual-play upgrade audit. All PRESENTATION — no economy values changed,
the lock stands. Covers the original three Sprint 4.5 items (cost-rendering overhaul,
active process strip, staff availability chip) plus three new findings from the audit
(upgrade copy, hiding v2-only items, the idle-staff trap) and a regression test for the
tab-lock bug class.

**Built:**
- `src/data/narrative.ts` (new) — the first real consumer of CLAUDE.md rule 9 ("game
  text only from NARRATIVE_EVENTS.md, referenced by ID"): `NARRATIVE_TEXT` (U-01..U-09
  upgrade copy, T-10/T-11/T-12 idle-staff copy) + `narrativeText(id, vars?)` for T-10's
  `{n}` open-slot-count placeholder. N-* (Mission Log) and T-01..T-09 (FTUE tooltips)
  land when their own consumers do (Sprint 5's Mission Log, Sprint 8's tooltip system).
- `core/types.ts` — `InternalUpgradeDef.description` renamed to `narrativeId` (it was
  never actually rendered before this sprint — real gap, not a rename for its own sake);
  `BuildingDef` gains `description: string`, populated for every building by transcribing
  ECONOMY §4's Effect column (same "plain data field, not narrative-ID-routed" treatment
  established for `ResearchNode.description` — a mechanical fact, not authored narrative
  prose, so it doesn't go through NARRATIVE_EVENTS). **Flagging this transcription
  choice explicitly**: NARRATIVE §6 only authored new prose for the 9 internal upgrades,
  not for base building purchases, so building descriptions are ECONOMY-table text
  lightly smoothed into sentences, not freshly-authored narrative voice — happy to
  redo these as real NARRATIVE_EVENTS content if that's what "building... may not be
  offered without plain-language copy" was meant to require.
- `data/buildings.ts` fully rewritten: every building has a `description`; every
  internal upgrade has `narrativeId` instead of the old unrendered `description`; Sound
  Suppression, Cryogenic Stand, and Heavy Crane are **removed from the data entirely**
  (not flagged/filtered — genuinely absent, so nothing downstream can accidentally
  render them regardless of future UI changes). Radar was already correctly absent from
  Tracking Station's upgrade list (confirmed, not a fix).
- `data/resourceNames.ts` gains `RESOURCE_ICON` (icon per resource for cost display;
  Funding uses `$` as a prefix instead, per UI_SPEC §4). `core/format.ts` gains
  `formatCost`/`formatCostEntry` (string form, for non-JSX contexts like button labels
  built from plain strings). New `ui/CostLabel.tsx` is the JSX form, used everywhere a
  cost renders in markup — the one place that guarantees UI_SPEC §4's "every icon has a
  tooltip with the full name" rule instead of leaving it to every consumer to remember.
- **BuildingTile.tsx rewritten**: every tile shows `def.description` unconditionally
  (before, only buildings with `production` showed any effect text at all — roughly
  half the roster showed just a name, level, and price, a real "name and a price alone"
  violation); internal upgrades now render their real `narrativeId`-resolved text
  (previously computed and stored but never displayed at all); `unlockCondition.kind ===
  'locked'` buildings (Training Center) render a locked badge with no purchase path
  instead of a technically-functional free "Build" button; T-12 shows under any role row
  that's fully staffed, explaining why the `+` is disabled instead of leaving it a silent
  dead button. **Also closed a separate, pre-existing gap found during this audit**:
  Training Center (`teaser: true` since Sprint 3.5/4) had zero UI consumers anywhere —
  UI_SPEC §2b's one deliberate v1 teaser was never actually rendered. Added to the
  Campus panel now.
- `core/staff.ts` gains `openSlotsForRole` (role-specific — a Technician hire can't fill
  an Engineer slot even if the program has open Engineer slots elsewhere) and
  `totalOpenSlots` (the program-wide sum T-10 displays).
- `StaffHiring.tsx`: T-10 always-visible open-slots line; T-11 gate before any hire that
  would land with zero open slots for that specific role — `window.confirm(...)` with
  the exact NARRATIVE §7 text (same confirm-dialog pattern already established for the
  dev reset button), re-fires per hire, never blocks the hire outright (owner's explicit
  "hiring is never blocked" instruction).
- `ActiveProcessStrip.tsx` (new) — UI_SPEC §2c: gathers every in-flight process across
  the three places they currently live (`research.inProgress`, `certifications.
  inProgress`, the generic `processes` array's `training` entries) into one flat,
  sorted-by-remaining-time chip strip directly under the ticker. **This is what makes a
  promotion trackable at all right now** — nothing else in the UI showed its progress
  before this. Tapping a chip jumps to the process's complex (Campus for research/
  training, Testing for certification). Reuses the existing `ProcessProgress` component
  for the bar/remaining-time rather than duplicating it. Collapses to zero height when
  empty; overflow past 4 collapses into a tappable "+N".
- `StaffAvailabilityChip.tsx` (new) — UI_SPEC §2c: `Available: 2 Tech · 1 Eng` in every
  complex panel's header (unassigned pool only), tapping it switches to Campus.
- `ui/ComplexTabs.test.tsx` (new) — the regression test for the tab-lock bug class (3rd
  occurrence: Complex B in Sprint 3, Testing in Sprint 5): asserts Campus/Production/
  Testing are genuinely state-driven, AND explicitly asserts Launch stays locked even
  once `flightProgram` is researched — annotated that this specific assertion should be
  *replaced* with a state-driven version when Sprint 7 builds Complex D's panel, not
  just deleted, so its removal is a deliberate act, not an accidental regression.
- `data/buildings.test.ts` (new) — structural guarantees stronger than "wasn't observed
  in one Playwright run": no building declares a v2-only upgrade id (impossible to
  render since the ids are simply absent from the data), Tracking Station has no Radar
  upgrade, every internal upgrade's `narrativeId` resolves to real text, every building
  has non-empty description text.
- **Checked, not changed**: BACKLOG's parked "Second research track" concern
  (`research.inProgress: Process | null` shouldn't become architecturally impossible to
  extend). Confirmed it's cleanly encapsulated behind `resolveResearch`/`startResearch`
  with no other system assuming "exactly one, ever" — extending it later is a normal
  bounded migration (schema change + a resolution loop, mirroring how `core/time.ts`
  already resolves multiple parallel generic processes), not an architectural dead end.
  No code changed for this — confirmed by reading, not by adding speculative flexibility
  ahead of the feature actually being built.

**Verification:**
- 204 tests passing (up from 200 at Sprint 5's core/data close: +2 staff.ts, +4
  ComplexTabs.test.tsx, +4 buildings.test.ts — some prior counts folded into these).
  Typecheck/lint/build clean, dev-only tooling confirmed still absent from the production
  bundle, `sim/run.ts` re-run (untouched — presentation only) with no regression: pacing
  floor still PASS, Flight Data shares unchanged.
- Playwright, through a real browser (two script attempts — the first hit a real
  ordering bug in the *script*, see below): confirmed Training Center renders with its
  description and a locked badge, no buy button; T-10 shows "Open slots across the
  program: 0" on a fresh save; hiring with zero open slots (the very first hire, nothing
  built yet) shows the exact T-11 confirm text and re-fires on a second idle hire, not
  just once; the hire button itself now reads "Hire ($57)" — no resource noun; Classroom
  shows its real U-01 narrative text (not just a name and a price) and its Buy button
  reads "Buy ($400)"; starting a Technician→Engineer promotion immediately shows a
  "Promoting: Technician → Engineer · 15m 1s" chip in the process strip, which
  disappears the instant the promotion resolves; the Production tab shows its own staff
  chip without navigating to Campus; a full-page text scan found zero occurrences of
  "Sound Suppression", "Cryogenic Stand", "Heavy Crane", or "Radar"; a scan of every
  cost-bearing button found zero resource-noun-after-a-number occurrences. Zero console
  errors. Screenshots: `25-sprint4.5-training-center.png`, `26-sprint4.5-process-
  strip.png`.
- **Real script bug, not a product bug (the inverse of the usual timing-trap pattern —
  worth noting as its own category):** the first verification attempt tried to trigger
  T-11 (hire with 0 open slots) *before* pitching any Funding at all — the Hire button
  was correctly `disabled` (unaffordable, 50 F needed, 0 F available) and Playwright
  timed out waiting for a click target that was never going to become clickable. Fixed
  by moving the pitching step before the first hire attempt. Not logged to the timing-
  traps memory (that file is specifically about time-warp/salary-drain interactions);
  this was plain step-ordering.

**Scope notes:**
- The idle-hire confirm uses a native `window.confirm()`, matching the existing
  dev-reset-button precedent — functionally correct and testable, but stylistically a
  break from the control-room theme. Flagged as a candidate for an in-theme confirm
  modal during Sprint 11 polish, not gold-plated now.
- SPRINTS.md's own Sprint 4.5 section wasn't mechanically expanded to list items 1-3 as
  numbered sub-tasks (it still shows the original 3-item list from before this audit) —
  noted since SPRINTS.md is nominally "the authority on order and scope," but NARRATIVE
  §6/§7 and UI_SPEC §4 fully specify the content either way, and the owner's chat
  message was explicit and unambiguous about scope/ordering, so this didn't block
  starting the work. Not fixed unilaterally (a doc-completeness gap, not a conflict to
  resolve by editing the doc myself).
- Sprint 5's Mission Log narration and certification-trigger UI are next, now unblocked
  on the new convention. One open question flagged for that step: GDD §7's "designed
  first failure" is meant to surprise the player (the scripted Probe-1 test 1 always
  fails) — but UI_SPEC §4 now requires every purchasable to state its effect BEFORE
  purchase. Does the certification button for that specific test need to say it will
  fail, or is the existing narrative-surprise intent meant to override the transparency
  rule for this one, deliberately-scripted case? Asking before writing that button's
  copy, not guessing either way.

## Sprint 5 — CLOSED (2026-07-26)

UI_SPEC replaced to v3.3, answering the disclosure-scoping question above: the rule is
scoped to player CHOICES. Probe-1's scripted test 1 isn't one, so it's carved out —
cost/duration shown like any process, no result or Confidence preview, since there's
nothing to disclose and no Confidence formula applies to a single test (§7b describes
the certification as a whole). Test 2 and extended get normal disclosure once test 1
has resolved. This unblocked the last two Sprint 5 tasks: Mission Log narration and the
certification trigger UI.

**Built:**
- `data/narrative.ts` gains N-01..N-17 (§1, all of it — transcribed once now that a real
  consumer exists, rather than touching this file again every time a later sprint adds
  the system behind one more beat) and `markSeen` (idempotent append, mirrors
  `registerModifier`'s shape). **Only N-01 through N-08 have an actual trigger wired
  anywhere in the code** — everything past N-08 needs Sprint 6+ systems (VAB, Aurora I,
  contracts, Pad B) that don't exist yet; the text sits ready, unwired, same "infra
  ahead of its content" restraint as everywhere else in this project.
- Trigger wiring, at the store level (mirrors `trackFirstOccurrence`'s existing
  alongside-the-pure-action pattern): N-01 (first pitch), N-02 (first hire), N-03
  (Finance reaches level 1), N-06 (Test Stand built) are action-triggered in `pitch`/
  `hire`/`buyBuilding`; N-04 (lifetime Funding crosses 300 — Complex B unlock) and N-05
  (first Hardware ever fabricated) are threshold checks in `applyTick`, since passive
  production can cross either with no discrete action to hook. N-07 (scripted failure)
  and **N-08 (certification success — found missing while wiring this: the reward was
  already correct since Sprint 5's core/data phase, but nothing marked the beat seen)**
  are set directly in `core/certification.ts`'s own resolution, using the same
  `markSeen` helper.
- `ui/MissionLog.tsx` (new) — UI_SPEC §3.4: collapsible bottom panel, last entry always
  visible as one italic line, expands to a full reverse-chronological feed. Pure display
  over `narrative.seen`; renders nothing until the first beat fires (no empty panel on a
  fresh save).
- `data/certifications.ts`: `CertificationTestDef` gains an optional `description` —
  **populated for test 2 and extended, deliberately absent for test 1** (the data-level
  enforcement of the v3.3 carve-out — "genuinely absent," same pattern as the removed
  `[v2]` upgrades, not a UI-side conditional that could be bypassed by accident).
- `ui/CertificationPanel.tsx` (new) — mirrors `ResearchPanel`'s exact card-state shape
  (locked/available/in-progress/done) and its `useNow`-scoped countdown pattern, shown
  once the Test Stand is built (level ≥ 1). Test 1's card renders cost + duration only;
  test 2/extended render their `description` too, once unlocked.
- Wired into `App.tsx`: `MissionLog` at the app root (after `<main>`); `CertificationPanel`
  inside `TestingPanel`, gated on Test Stand level.

**Verification:**
- 210 tests passing (up from 204), including new coverage for every narrative trigger
  (`persistStore.test.ts`) and N-08 (`certification.test.ts`). Typecheck/lint/build
  clean, dev tooling still excluded from the bundle, `sim/run.ts` unaffected (narrative
  triggers touch no economy value).
- Playwright, through a real browser, driving the actual certification mechanic live
  (not injection — this is the one part of Sprint 5 where the mechanic itself, not just
  UI reactivity, is what's under test): confirmed test 1's card shows cost ("🔧 10 + ⛽
  50, 25m 0s") and duration with **zero** result or outcome text anywhere on it; starting
  it puts a "Certifying" chip in the process strip; once it resolves, the Mission Log's
  last-entry line shows N-07's real text verbatim and test 1 flips to "Done"; test 2
  (previously locked, showing "Requires: first attempt resolved") becomes available with
  its real disclosure text ("Guaranteed success. Certifies Probe-1..."); starting and
  resolving it shows N-08's real text verbatim, flips test 2 to "Done," and unlocks
  extended certification with its own disclosure; the expanded Mission Log feed contains
  all beats in order. Zero console errors. Screenshots: `27-sprint5-scripted-failure-
  narrated.png`, `28-sprint5-certified.png`.
- **Real script bug caught before it produced a false result:** the first attempt reused
  an 800ms `warpWaitThenReset` sized for Sprint 4.5's 3-minute research-node waits,
  applied unchanged to certification's 25-minute tests (need ≥ ~2.5s real at ×600, not
  0.8s) — test 1 never actually resolved in time, and the Mission Log's last entry
  stayed on N-01 from the earlier pitch. A second issue, found in the same run: the
  injected save's starting resources already implied `lifetimeEarned` past N-04/N-05's
  thresholds (500 lifetime Funding, 50 lifetime Hardware), so both fired on the very
  first live tick and displaced N-01 as "last entry" before the assertions meant to
  check it — correct trigger behavior, but it made the script's own narrative-ordering
  assertions misleading. Fixed by pre-seeding `narrative.seen` with `['N-04', 'N-05']`
  in the injected save (consistent with what those resource values actually imply) and
  fixing the wait durations; not logged to the timing-traps memory (no time-warp/salary
  interaction this time, just two ordinary script-construction mistakes).

**Sprint 5 acceptance, verified end to end through the integrated path:** "full test-
fail-narrative-retry-certify flow works and is narrated." All five original tasks
(Test Stand reachability, certifications as processes, scripted failure, Mission Log +
narrative triggers, Flight Experience visible as a resource) are complete. Sprint 5 is
closed. Next: Sprint 6 (sounding rockets).

## Sprint 6 — CLOSED (2026-07-27)

Sounding rockets: the first launches. ECONOMY §7a describes the mechanic ("the full
launch loop in miniature") but leaves several implementation-level questions open —
resolved here from the numbers actually given, not invented, each noted below so a
future sprint can revisit the reasoning rather than the conclusion alone.

**Schema (`schemaVersion` 3 → 4, migration in the same commit):**
- `SoundingRocketId`, `SoundingChecklistItemId`, `SoundingMissionState` (new) — mirrors
  `PadMissionState`'s shape (`confidence`, `committedRoll: number | null` drawn at
  checklist completion per rule 12) but simplified to 3-4 items. `MissionState` gains
  `sounding: SoundingMissionState | null` (current attempt; one at a time, same "single
  in-progress slot" precedent as research/certification) and `soundingHalfDurationNext:
  Partial<Record<SoundingRocketId, boolean>>` (GDD §7b's re-integration bonus, which
  must survive the mission-slot reset that happens on every resolution).
- `LaunchRecord.padId` widened to `PadId | null` (sondas launch from the Launch Rail, not
  a Complex D pad — safe since nothing had ever produced a `LaunchRecord` yet); gained
  optional `contractId` (additive, rule 5).
- `ActiveContract` gained optional `deadlineMissed` (additive, rule 5) so the missed-
  deadline tick check never double-penalizes the same contract.
- `RecordId` (new): the 6 ECONOMY §8b records, as a plain `string[]` push into the
  existing `records` field (no dedicated array type, matching `research.completed`'s own
  shape).
- `v3ToV4` migration: `mission.sounding: null`, `mission.soundingHalfDurationNext: {}`.

**Judgment calls (numbers are exact; the interaction model connecting them is inferred):**
1. **Checklist item mechanics.** §7a lists 3 items (Assembled/Propellant/Weather window)
   with a duration for assembly but *no* duration for "Propellant" — read as the signal
   that it isn't a timed step: it's a **live check** (`propellant.amount >= required`,
   recomputed every tick, never a stored one-shot flag), deducted only at the actual
   launch — confirmed directly by §7a's own column header, "**Launch** consumes." Weather
   window is a timed process with a **random** uniform(2,5) min duration per §11 (BACKLOG
   confirms variable weather *quality* is v2 — v1 weather is binary resolved/not,
   justifying the sonda formula's unconditional "+5 optimal weather," since the checklist
   makes the window mandatory, unlike the full 8-item formula's "0 if launched early"
   phrasing for a skippable step). S-2's extra "flight review" (§7) is an instant
   Research spend, matching the doc's own word choice ("spend," not "load").
2. **Failure resolution applies program-wide, not just to Aurora I.** GDD §7b's package
   (60% Hardware recovery, 80% XP, 60% Flight Data, half-duration re-integration, no Rep,
   no payout) is written under the generic "Launch Confidence" heading, and its numbers
   are independently confirmed by Sprint 5's own scripted-failure reward: 6 of 10 H
   recovered = exactly 60%. Applied identically to sonda failures.
3. **Tier-0 contract cost is folded into the linked flight's own steps**, not a separate
   charge: §10's "10 H + 40 P = the standard S-1 (8H+30P) + client payload integration
   (2H+10P)" is modeled as +2 Hardware at assembly and +10 Propellant at launch, only when
   `contractId` is set (S-1 only — tier-0 never flies an S-2).
4. **Real gap caught by cross-checking `sim/run.ts`'s own `CONTRACT_REWARDS` table**
   (built in Sprint 0, never wired into real code until now): ECONOMY §8's "Contract
   fulfilled" row pays its own Flight XP (+40) and Flight Data (+450) for tier-0, **on
   top of** the underlying S-1 flight's own reward (15 XP/200 Flight Data) — no
   cross-reference to §10 the way its Reputation column has, so it isn't a restatement.
   Missed on the first pass; caught before writing tests, not after.
5. **"First flight"/"Kármán line" gate on a *successful* flight, not a mere attempt** —
   unlike "First ignition," which explicitly carves out "(even the scripted failure)."
   The presence of that carve-out on only one record implies the others default to
   success-gated; N-08b/N-08c's own narrative text ("Your first rocket flew... the lab
   already wants a second flight") only makes sense as a success beat. (`sim/run.ts`'s
   own comment reasoned the opposite way for its pacing-only bot; not followed here since
   the sim never actually models sonda failure, so it never had to resolve the tension.)

**Built:**
- `data/soundingRockets.ts`, `data/contracts.ts` (new): S-1/S-2 defs, tier-0 templates
  (client list from NARRATIVE §4), failure-resolution rate constants, the simplified
  Confidence formula's terms.
- `core/soundingMission.ts` (new): `computeSondaConfidence`, `isSoundingRocketUnlocked`,
  `startSoundingAssembly` (pays Hardware, opens the mission slot, applies the pending
  half-duration bonus and consumes it), `startSoundingWeatherCheck`,
  `paySoundingFlightReview`, `applyCompletedSoundingProcesses` (flips checklist items
  when their backing process resolves — same dispatcher pattern as `applyCompletedProcesses`
  for staff), `resolveSoundingChecklist` (tick-time: live propellant check, roll
  commitment), `launchSoundingMission` (resolves the already-committed roll, applies
  rewards or failure resolution, fulfills a linked contract on success, logs a
  `LaunchRecord`, resets the mission slot).
- `core/contracts.ts` (new): `maybeGenerateTierZeroOffer` (regenerates whenever no tier-0
  offer is pending — expired or just-accepted are the same "slot freed" event),
  `acceptContract`, `resolveContractDeadlines` (−15 Rep floor 0, tick-driven, idempotent
  via `deadlineMissed`), `activePendingContracts`. Written to extend cleanly when Sprint
  9 adds tiers 1/2 (`CONTRACT_TIERS` already lists all three).
- `core/records.ts` (new): generic, tick-driven — every trigger reads a **durable** state
  signal (`certifications.engines.probe1.attempted`, `mission.launches`,
  `contracts.active`), so a record needs no imperative call site anywhere and correctly
  backfills retroactively (verified live: "First ignition" fires on the very first tick
  of a save where Probe-1 was already attempted before this system existed).
- Sounding/certification processes both live in the generic `processes: Process[]` array
  (kinds `integration`/`weather_window`, tagged `payload.missionKind: 'sounding'`) — this
  is what lets the *existing* warp-shift logic in `applyTick` cover them for free, no new
  time-warp code needed.
- `state/persistStore.ts`: new `resolveSoundingContractsAndRecords` helper, shared by
  `applyTick` and `computeBootOffline` (rule 6) — advances checklist/roll, rotates the
  tier-0 offer, resolves deadlines, grants records. New actions:
  `startSoundingMission`, `startWeatherCheck`, `payFlightReview`, `launchSounding`,
  `acceptContractOffer`. **Real gap fixed while wiring this (same class as Sprint 5's
  away-summary miss): `fundingGained`/`researchGained` in the away-summary were still
  reading pre-sounding-resolution resources — a Program Record or contract fulfillment
  resolving during an offline gap would have been silently missing from "While you were
  away."**
- `ui/SoundingMissionPanel.tsx`, `ui/ContractsPanel.tsx` (new), both in the Testing tab
  once Test Stand + Launch Rail are built. `ui/MissionLog.tsx` gains a Log/Records tab
  switcher (UI_SPEC: "Records board lives as a tab inside this panel") — earned records
  show fully, unearned ones render as a dimmed "———" placeholder (UI_SPEC §2b). Rocket
  cards get full disclosure (cost, duration, effect) per UI_SPEC §4 — this is a player
  CHOICE, not Probe-1's scripted-test carve-out. `ui/ActiveProcessStrip.tsx` extended for
  the `integration`/`weather_window` kinds it was already structured to grow into.
- `sim/run.ts`: `S1_*`/`S2_*`/`TIER0_*`/`RECORDS` constants now import from the real data
  files instead of keeping a second hardcoded copy (per the file's own header note,
  same pattern Sprint 4 set for the research tree). Bot policy/approximations
  (guaranteed-success assumption, contract build folded into one timer) left untouched —
  still documented sim-only simplifications, not a spec for the real game.

**Verification:**
- 264 tests passing (up from 210), all new modules covered before any UI was written
  (rule 7). Typecheck/lint/build clean, dev tooling still excluded from the production
  bundle. `sim/run.ts --days=45` re-run: human-profile salary ratio (55%), sonda-era
  Flight Data share (23.7%) and satellite-era share (24.7%) all match the last-recorded
  figures exactly — confirming the constant-import swap changed nothing numerically —
  and the pacing floor (Aurora I not before day 5) still passes.
- Playwright, through a real browser, driving the actual mechanic live (injection only
  for the unrelated grind — building Test Stand/Launch Rail, researching probe1Engine,
  certifying Probe-1 — already covered by Sprint 5's own verification): assembled an
  S-1, ran its weather check in parallel, confirmed all 3 checklist items complete and
  the roll commits automatically (no button press) at exactly the moment they do,
  confirmed "First ignition" is correctly backfilled from a pre-existing `attempted:
  true` state on the very first tick, launched at a **guaranteed 100%** Confidence
  (extended-certified Probe-1 — the failure/re-integration branch is covered
  deterministically by `soundingMission.test.ts` instead, since re-proving RNG live would
  make the script flaky for no benefit), confirmed N-08b narrates and "First flight"
  earns; accepted a tier-0 offer, flew a contract-linked S-1, confirmed the contract
  fulfills (a fresh offer regenerates moments later, matching the "1 offer" rotation
  rule) and "First customer"/"First delivery" both earn; flew an S-2 (confirmed its extra
  Flight Review checklist item, paid it, launched), confirmed N-08c narrates and "Past
  the Kármán line" earns. Zero console errors. Screenshots `29`–`34` under
  `sprint6-*.png`, including the Records board showing three earned records, a correctly
  dimmed unearned "———" placeholder for "First orbit," and the accented "Kármán" label
  rendering correctly.
- One test-script correction, not a product bug: the first pass asserted a fulfilled
  contract would show a `--done` badge in the Contracts panel — it doesn't, because
  `activePendingContracts` (by design) drops fulfilled contracts entirely, and a fresh
  offer regenerates in its place. Fixed the assertion to check for the absence of a
  stale unfulfilled row instead; the real fulfillment signal ("First delivery" earning,
  funding/reputation paid) was already correct on the first run.

**Sprint 6 acceptance, verified end to end through the integrated path:** "repeatable
S-1 campaign funds progress via tier-0 contracts; extended certification reaches 100%
Confidence; S-2 crosses Kármán and awards its record." All four original tasks (Launch
Rail + sonda assembly workshop, S-1 mini-checklist + simplified Confidence + roll
commitment + countdown + results, tier-0 contracts, S-2 + Kármán record + N-08b/N-08c)
are complete. Sprint 6 is closed. Next: Sprint 7 (VAB, Aurora I & full Launch Sequence).

Between sprints: **ECONOMY_MODEL v3.4** ratified all three Sprint 6 judgment calls
(propellant as a live check, GDD §7b's failure package applying program-wide, records
gating on success except "First ignition") — no values changed, purely a changelog
confirming the shipped reading was correct.

## Sprint 7 — CLOSED (2026-07-27)

VAB, Aurora I & the full Launch Sequence — the sonda loop's "full-size" counterpart.
One genuine ambiguity was raised and ruled on **before** any resolution code was
written, because it was schema-shaping and expensive to get wrong: does every one of
the 8 checklist items (including "controllers fully staffed" and "optimal weather
window," whose GDD §7b wording implies a partial/early state — "proportional," "0 if
launched early") need its FULL state to check off, or is a genuinely partial/skippable
checklist real content? **Ruled: Option A, mandatory-for-all-8**, mirroring the sonda
checklist exactly — the "proportional"/"launched early" wording describes only the live
Confidence preview shown mid-checklist, never a reachable end state at countdown. Option
B (a real "launch early" skip mechanic) is parked in BACKLOG, contingent on Sprint 9's
contract deadlines actually creating time pressure. Codified in **GDD v2.10**.

**Schema:** almost entirely additive — `PadMissionState`/`ChecklistItemId`/`PadId`/
`EngineId('orbital1')` were all already scaffolded since Sprint 0 specifically to avoid
this. The only real additions: `CertificationTestDef.successRate?` (probabilistic vs.
deterministic dispatch) and `MissionState.auroraHalfDurationNext?` (GDD §7b's
re-integration bonus, per pad — additive optional, rule 5, no migration).

**Judgment calls resolved from the text (not invented — flagged so Sprint 9 doesn't
re-litigate):**
1. **Stage-to-checklist mapping:** the 8 sequential `AURORA_I_STAGES` (ECONOMY §7) don't
   map 1:1 to the 8 checklist items — the first 5 (structure/engines/guidance/satellite
   payload/finalIntegration) collectively satisfy ONE item ("Rocket integrated"); the
   remaining 3 (padTransfer/propellantLoad/flightReview) map 1:1; "Engines certified,"
   "Controllers on station" and "Tracking active" aren't stages at all — they're live
   reads of the certification/staffing/building state.
2. **The "Engines" integration stage requires Orbital-1 already certified** — ECONOMY
   §7's stage name is literally "Engines (Orbital-1 certified)," a real sequencing gate,
   not just a label.
3. **Orbital-1's cert reuses the `stage: 'first'/'retry'` split** (not a wholly separate
   shape) — a `successRate` field on `CertificationTestDef` generalizes the resolver for
   a genuinely probabilistic test (80% every attempt, GDD's own "at half duration"
   phrasing giving 'retry' its own halved `durationMs` directly, no dynamic flag needed)
   while every deterministic Probe-1 test keeps its exact existing behavior unchanged.
4. **Orbital-1's certification success reuses §8's generically-worded "Static fire
   success" reward** (+15 XP/+2 Rep/+150 Flight Data) — its own ECONOMY §6 row only
   restates the FAILURE reward explicitly (+60 XP), but Probe-1's success reward is
   ALSO only sourced from §8's row, by the same generic (not "Probe-1-specific") wording.
5. **Roll commitment for a probabilistic certification is drawn at process START, not
   resolution** (`core/actions.ts`'s `startCertification` now draws+stores it in the
   process payload when `successRate` is set) — the certification-specific analogue of
   rule 12's "checklist completion, not button press": the decisive moment is the
   player's commit (clicking Start), not whichever later tick happens to notice the
   timer ran out.

**Two real gaps caught before/during Playwright verification, not after:**
- **Cross-checking `sim/run.ts`'s own Orbital-1 modeling** (per the Sprint 6-ratified
  habit) found it granted the scripted `+60 XP` on failure but **nothing at all on
  success** — an oversight, not a deliberate reading (the sim's own header note frames
  it as an approximation, and omitting a reward that's dwarfed by Aurora I's own payout
  moments later has near-zero effect on the pacing metrics being measured, which is
  probably why it went unnoticed). Fixed in the sim alongside pointing it at the real
  `data/certifications.ts`/`data/auroraI.ts` tables instead of a fourth hardcoded copy.
- **`ui/ActiveProcessStrip.tsx` was never extended for `missionKind: 'auroraI'`** —
  Sprint 6 added the sounding-rocket branch but not this sprint's, so Aurora I's stage
  and weather-window processes were silently invisible in the strip, a direct UI_SPEC
  §2c violation ("No process may exist without a chip"). Caught by the Playwright
  script's own coexistence check (a `false` where `true` was expected), not by
  inspection — fixed, then re-verified.

**Built:**
- `data/auroraI.ts` (new): the 8 sequential `AURORA_I_STAGES` (cost/duration/name),
  `VAB_STAGE_IDS` (the 5 that fold into one checklist item), `AURORA_I_REWARD`.
  `data/launch.ts` (new): the failure-resolution rates and weather-window range,
  factored out of `data/soundingRockets.ts` (which now re-exports them) since Aurora I
  needed the exact same program-wide constants — one source of truth instead of a
  second copy.
- `data/certifications.ts` + `core/certification.ts`: Orbital-1's three tests
  (`orbital1Base`/`orbital1Retry`/`orbital1Extended`); `resolveCertification` gained a
  `successRate`-gated probabilistic branch alongside the existing deterministic one,
  fully backward-compatible with every Probe-1 test.
- `core/confidence.ts` (new): `computeConfidenceBreakdown` — the full 7-term GDD §7b
  formula, returning every term individually (UI_SPEC's "tap-to-expand breakdown").
  Verified: with extended certification, the deterministic terms alone reach exactly
  100 — zero XP, no Service Tower needed.
- `core/auroraMission.ts` (new, the sprint's core module): `nextAuroraStageId` (the
  strict 8-stage sequence), `startNextAuroraStage` (pays cost, starts a process — or,
  for the 0-duration Flight Review, resolves instantly, no process at all — mirrors the
  sonda's own instant-spend pattern), `maybeAutoQueueAuroraStage` (the `vabQueues` tech's
  auto-progression, scoped to the 5 VAB stages only — transfer/propellant/flight review
  stay deliberate manual decisions even with the tech), `applyCompletedAuroraStages` /
  `applyCompletedAuroraWeather` (process-completion dispatchers), `resolveAuroraChecklist`
  (tick-time: live Controllers/Tracking checks, Confidence, roll commitment per the
  ratified Option A), `launchAuroraMission` (resolves the committed roll, GDD §7b's
  general failure package on a miss, resets the pad for a future mission — Sprint 9
  reuses this same pad), `resolveAuroraTick` (the per-tick composition, iterating every
  pad that exists rather than hardcoding padA).
- `state/persistStore.ts`: `resolveMissionsContractsAndRecords` (renamed and extended
  from Sprint 6's `resolveSoundingContractsAndRecords`) now threads Aurora resolution
  through both `applyTick` and `computeBootOffline` alongside sounding/contracts/records.
  New actions: `startAuroraStage`, `startAuroraWeather`, `launchAurora`. Narrative:
  N-09 (Aurora I integrated) and N-15 (Orbital flight tech) as threshold checks
  (mirrors N-04/N-05); N-10 (countdown) set imperatively in `launchAurora` BEFORE
  resolution, matching its place in the sequence; N-11/N-12 (success/failure) set
  directly inside `launchAuroraMission`, mirroring N-08's pattern.
- `ui/LaunchSequencePanel.tsx` (new): the 8-item checklist, Confidence with tap-to-expand
  breakdown, a unified "next stage" widget (drives all 5 VAB stages + transfer +
  propellant + flight review through one consistent affordance), the dominant countdown
  button (the `<100%` confirm-to-gamble gate mirrors the sonda's exact pattern), and an
  inline result card. **Scope note:** the doc's "own full screen... 10→0 countdown"
  animation is deliberately not built — pressing the button resolves the
  already-committed roll (rule 12) immediately, same restraint Sprint 6 used for sondas;
  real animation is Sprint 11 polish territory.
- `ui/ComplexTabs.tsx`: Launch tab unlock is now state-driven (`flightProgram` tech) —
  the regression test this was explicitly pending on (`ComplexTabs.test.tsx`, written in
  Sprint 4.5) was updated per its own instruction, not deleted.
- `ui/ActiveProcessStrip.tsx`: extended for Aurora's own `integration`/`weather_window`
  processes (see gaps above).

**Verification:**
- 306 tests passing (up from 264), including the SPRINTS-mandated roll-commitment
  regression test: a committed roll is written to a save, the save round-trips through
  real `saveGame`/`loadGame` (actual JSON serialization, not just an in-memory check),
  and the reloaded state resolves to the identical outcome — with the resolver's
  `randomFn` wired to throw if it's ever called post-reload, proving redraw is
  structurally impossible, not just empirically absent this run.
- `sim/run.ts --days=45` re-run: human-profile figures essentially unchanged (salary
  55%, sonda Flight Data 23.7%, satellite share 24.7% → 24.8% — the tiny shift being the
  expected, correct result of fixing the missing Orbital-1 success-reward gap above,
  not a regression). Pacing floor still passes (Aurora I not before day 5).
- Playwright, through a real browser, driving the actual mechanic live (injection only
  for genuinely repetitive grind — 3 of 5 identical-code-path VAB stages, and the
  unrelated Campus-through-Testing build-up already covered by prior sprints):
  Confidence breakdown showed the live 80% mid-checklist value and its full term-by-term
  math; live-exercised 2 more VAB stages, pad transfer, propellant load, and the instant
  Flight Review; confirmed a sounding-rocket assembly and an Aurora I stage coexist as
  simultaneous chips in the same process strip; reached **exactly 100% Confidence with 0
  Flight XP and no Service Tower purchased** — the acceptance criterion's specific claim,
  proven live, not just in the formula; countdown resolved, result card showed the
  correct reward breakdown, Mission Log narrated N-11 verbatim, "First orbit" earned
  (alongside "First ignition" correctly backfilling), and Payload Processing became
  visible in the Testing tab the instant `auroraISuccess` went true — confirming the
  Sprint 0-era `unlockCondition` wiring finally has a real trigger behind it. Zero
  console errors. Screenshots `35`–`38` under `sprint7-*.png`.

**Sprint 7 acceptance, verified end to end through the integrated path:** "end-to-end
first satellite launch; confidence matches formula and 100% is reachable without XP;
sonda loop and full loop coexist." All five original tasks (Complex D build/slots/
unlock, Aurora I stage integration incl. satellite payload, full 8-item Launch Sequence
+ `core/confidence.ts` + Orbital-1 probabilistic certification, roll commitment, countdown
→ resolution → results with rewards + Records) are complete. Sprint 7 is closed. Next:
Sprint 8 (FTUE & Phase 1 close).

## Sprint 7.5 — CLOSED (2026-07-27)

Discovery & clarity pass — the owner's first end-to-end playthrough of Sprint 7's build,
inserted between Sprint 7 and Sprint 8. Five docs replaced (UI_SPEC, ECONOMY_MODEL,
NARRATIVE_EVENTS, SPRINTS, BACKLOG), all to **v3.5**; diffed against the repo version
before applying (rule 5b) — all five diffs were clean and additive, nothing dropped.
Committed separately (`39fb439`) before any implementation, matching the established
pattern of ratifying a doc replacement before building against it.

**Two real, pre-existing gaps found and closed while implementing the explicitly-listed
SCOPED UNLOCK items — not scope creep, but necessary to implement what the doc actually
asked for:**
- ECONOMY §4 v3.5 frames Test Stand's new per-level effect as "stacking multiplicatively
  with the Instrumentation upgrade" — phrased as though Instrumentation's own -25%
  (NARRATIVE U-04) already worked. Grepped the codebase: it was dead narrative text,
  never wired into `startCertification`'s duration anywhere. Can't implement "stacks
  with Instrumentation" without Instrumentation doing anything, so both were wired
  together in `core/certification.ts`'s new `certificationDurationMultiplier`.
- Confirmed (not fixed — out of scope, flagged below) a second, unrelated latent gap:
  `basicLogistics`'s -25% pad-transfer-time research effect registers a
  `transfer.duration` modifier (`core/modifiers.ts`) that is never queried anywhere —
  `core/auroraMission.ts`'s `padTransfer` stage duration ignores it entirely. Left
  untouched deliberately: it's a different bug from what this sprint's SCOPED UNLOCK
  named, and the doc was careful to scope which two effects get to move pacing numbers
  this sprint ("re-run the sweep" was said about Test Stand/Auto-refuel specifically,
  not this). Flagging for the owner rather than silently expanding scope.

**Built:**
- **Campus staged reveal (UI_SPEC §2d):** `App.tsx`'s `CampusPanel` gates Finance (150
  lifetime Funding) and the Staff panel (Finance built) on live, naturally-monotonic
  state — no schema change needed for those two. Crew Quarters + R&D Lab's reveal
  ("staff pool reaches its cap for the first time") is NOT naturally monotonic once
  staff dismissal exists in the same sprint (a player could hit 2/2, then Release back
  under cap) — backed by a new persisted one-way latch, `GameState.staffCapReachedOnce`
  (additive optional field, rule 5, no migration; set in the `hire` action, mirroring
  N-02's "First hire" pattern). Research panel hidden entirely until R&D Lab is built.
- **Research panel redesign (UI_SPEC §3):** `ResearchPanel.tsx` rewritten — a compact
  vertical chain per branch (small nodes, ✓/◐/○ status glyph, connected by a border-left
  rail) replacing the always-expanded card grid; tapping a node opens a docked detail
  panel (cost/duration/full effect text/Start), only one open at a time. Deliberately
  left `.research-node`/`.research-panel` classes untouched — CertificationPanel,
  SoundingMissionPanel and LaunchSequencePanel all still use that card language for
  their own unrelated cards; the redesign is scoped to ResearchPanel only, via new
  `.research-tree*`/`.research-detail*` classes.
- **Missing text (NARRATIVE §8/§9/§10):** every research node now has real player-facing
  copy, including the two honest-zero-effect gates (`aluminum`, `soundingRockets`) —
  routed through `narrativeText(node.id)` (§8 has no separate ID column, so the node's
  own id doubles as the key — same "referenced by ID" spirit as U-01..U-09, just without
  a redundant second namespace). `ResearchNode.description` (the old inline-data-field
  pattern) removed entirely now that real narrative content owns this text (rule 9).
  T-14 (tier toast)/T-15 (release confirm)/T-16/T-17 (complex first-entry tips) added;
  Rush Order's description (§10) now renders on its tile.
- **Clarity rules (UI_SPEC §4):** `BuildingTile` gained a "Consumes: X per Y" line for
  Fabrication/Refinery (their `production.consumes` was already real data, just never
  rendered) and a next-level delta preview (new `core/upgradePreview.ts`, pure +
  unit-tested — covers production/capBonus/staffCapBonus buildings plus Test Stand's new
  per-level effect; returns `null` rather than inventing a claim for buildings with no
  wired numeric effect yet, e.g. Tracking Station's XP multiplier, which is Sprint 10).
  `Ticker`'s near-cap/over-cap resource rows are now tappable, naming the building that
  raises that cap (derived from `BUILDINGS`' own `capBonus` data, not a second hardcoded
  map). A one-time `TierChangeToast` fires on the Aluminum→Titanium transition
  (session-local `useRef` baseline so a returning player who already has Titanium never
  sees it replay) — explicitly NOT a Mission Log entry, per the doc.
- **Staff dismissal (UI_SPEC §4b, new capability):** `core/actions.ts`'s `releaseStaff`
  (no refund; unassigns one first only if every hired unit of that role is currently
  assigned somewhere) + a `release` store action; `StaffHiring.tsx` gained a Release
  button per role with an inline confirm (a local-state two-step, not a browser
  `window.confirm` modal — the doc is explicit this should read as reversible-feeling
  even though the save-state change isn't). Salary stops the instant of release with no
  extra bookkeeping — `totalSalaryPerSecond` already reads `pool.hired` directly.
  Promotion-cheaper hint added to the same panel (`hiringCost(role, hired) > flat
  promotion cost` — surfaces existing math, no value change).
- **SCOPED UNLOCK (ECONOMY §4/§5 v3.5):** Test Stand's per-level effect (linear, not
  compounding, matching every other per-level effect in this codebase — `-3%` per level
  beyond 1, stacking multiplicatively with Instrumentation) and Auto-refuel's effect
  (`-50%` on the `propellantLoad` Aurora-I-class stage specifically — sonda Propellant is
  a live check, not timed, per v3.4, so it never applies there). Both computed once at
  process START (`startCertification`/`startNextAuroraStage`), not re-derived at
  resolution — a later upgrade mid-process must not retroactively speed up an
  already-running timer. `sim/run.ts` updated to apply both (Instrumentation itself is
  NOT modeled in the bot's purchasing — it never buys internal upgrades besides Extended
  Rail/Classroom — a documented, conservative-direction simplification, not a gap).

**Verification:**
- 325 tests passing (up from 306), including `core/certification.test.ts`'s
  `certificationDurationMultiplier` suite, `core/upgradePreview.test.ts` (new file),
  `core/actions.test.ts`'s `releaseStaff` suite, `core/auroraMission.test.ts`'s two new
  Auto-refuel/stacking cases, and `state/persistStore.test.ts`'s
  `staffCapReachedOnce`/`release` suites exercising the real store (including the
  specific regression this sprint's own staff-dismissal capability could have caused:
  Release dropping the pool back under cap must NOT re-hide Crew Quarters/R&D Lab).
  Typecheck (`tsc -b`, project references — not the bare `tsc --noEmit` this repo's root
  config alone won't actually check), lint, and production build all clean; dev-only
  tooling confirmed still absent from `dist/assets/*.js`.
- Full sim sweep re-run post-SCOPED-UNLOCK, per the doc's explicit instruction: dual
  profile (seed 42, 30 days) — human still reaches Aurora I on day 5 exactly (pacing
  floor PASS, not before day 5), salary ratio 55% (top of the intended 30-55% band,
  unchanged); multi-seed sweep (seeds 1-10, 45 days) — median days to Aurora I still 5.0
  (comfortably under the day-12 ceiling too), Flight Data share 24.4%/24.7%
  sonda/satellite (both still inside 20-35%). No ECONOMY_MODEL value changed by this
  run — the two new effects shifted the numbers by less than a percentage point, not
  enough to threaten either sanity rule; reported per instruction, not tuned.
- Playwright, through a real browser, driving the two things the sprint's own acceptance
  text called out as needing LIVE verification (not injection) — a genuinely fresh save,
  no pre-seeded state: confirmed step 1 shows literally only Offices + the Training
  Center tease (zero Finance/Staff/Quarters/Lab/Research panel); pitched to exactly 150
  lifetime Funding live, confirmed Finance alone appears; built Finance live, confirmed
  the Staff panel appears while Quarters/Lab/Research stay hidden; hired one Technician
  (1/2) and confirmed Quarters/Lab still don't appear; hired the second (2/2) and
  confirmed both appear together in the same frame; **released a Technician back to 1/2
  and confirmed Crew Quarters/R&D Lab stayed visible** — the one-way-latch regression
  this sprint's own new capability could have caused, proven live, not just unit-tested;
  built R&D Lab, confirmed the Research panel then (and only then) appears. Tree
  interaction: tapped "Aluminum alloys," confirmed its detail panel states the zero
  effect explicitly ("No other effect — unlocks Titanium research"); tapped "Sounding
  rockets," confirmed the first detail closed and only one was open at a time; confirmed
  the × close button works. A second pass (injected save — repetitive grind: a
  level-5 Test Stand, a stocked economy, not the mechanic under test) confirmed Test
  Stand's delta preview reads "Level 6 → -15% certification duration (currently -12%)";
  Fabrication's new consumption line reads "Consumes: 📦 2 per Hardware"; tapping
  near-cap Funding on the ticker reveals "Build Warehouse to raise this cap"; the T-16
  Testing-complex tooltip appears and dismisses; and — researched Titanium live under
  ×600 warp (18s real for its 3h duration) — the tier-change toast fired with the exact
  T-14 text and did NOT appear as a Mission Log entry. Zero console errors across both
  passes. Screenshots `39`–`44` under `sprint7.5-*.png`.

**Sprint 7.5 acceptance, verified end to end through the integrated path:** "a fresh save
shows only Offices for the first ~2 minutes of clean play, reaching Finance/Staff/
Quarters+Lab in the documented order; the research tree fits without scrolling past 2-3
screens on desktop; every building/upgrade/research node states its effect; Test Stand
leveling and Auto-refuel visibly do something; staff can be released; sim sweep still
green." All six original tasks are complete. Sprint 7.5 is closed.

## Sprint 7.5 follow-up — basicLogistics SCOPED UNLOCK (2026-07-27, same day)

The gap flagged above (found while wiring Instrumentation, deliberately left unfixed
pending an owner decision) was picked up immediately as its own SCOPED UNLOCK, same
treatment as the Test Stand/Auto-refuel pair: `basicLogistics`'s -25% pad-transfer-time
modifier (`transfer.duration`, ECONOMY §5) was registered on research completion since
Sprint 4 but never queried anywhere. Now wired into `core/auroraMission.ts`'s
`startNextAuroraStage` for the `padTransfer` stage specifically (the only stage this
modifier ever applies to — every other Aurora I stage duration is untouched by it),
via `applyModifiers(stageDef.durationMs, modifiers, 'transfer.duration', now)`, stacked
multiplicatively with the pending re-integration/Auto-refuel discounts where more than
one applies at once. `modifiers` is threaded through `startNextAuroraStage` →
`maybeAutoQueueAuroraStage` → `resolveAuroraTick` → `resolveMissionsContractsAndRecords`
→ both `applyTick`/`computeBootOffline` and the direct `startAuroraStage` store action,
queried as it stood BEFORE the current tick's own resolution — the exact same "a
modifier only takes effect the moment it's registered" precedent `offline.capMs`'s query
already established, kept consistent rather than inventing a second convention.
`sim/run.ts`'s `startAuroraStage` applies the same 0.75× to the `padTransfer` stage.

327 tests passing (up from 325 — two new `core/auroraMission.test.ts` cases: the
modifier applying to `padTransfer` and explicitly NOT applying to an unrelated stage).
Typecheck/lint/build clean.

**Note on the request to re-run "all three profiles":** the sim currently only
implements two (`optimal`/`human`) — a third `casual` profile plus a dedicated
pacing-ceiling flag (human > day 12) were noted earlier in this file (v3.1 section,
"Lower-urgency... will land before Sprint 8... not yet done") as a real, previously-known
gap between SPRINTS.md's Sprint 0 spec and what actually got built. Still not built —
flagging again now that "before Sprint 8" has arrived, rather than silently running two
profiles under a claim of three, or building a whole new profile unasked. The sweep below
covers what exists: the dual-profile run plus the multi-seed human sweep (which already
gives a 45-day, 10-seed read that would catch a day-12 ceiling breach even without a
dedicated flag — none of the ten seeds got anywhere close).

**Full sweep re-run post-fix:**

| Metric | Value | Target |
|---|---|---|
| Days to Aurora I — optimal (seed 42) | day 3 | n/a (upper bound) |
| Days to Aurora I — human (seed 42) | day 5 | floor: not before day 5 — **PASS** |
| Days to Aurora I — human, median (seeds 1-10, 45d) | 5.0 (range 5.0-5.0) | ceiling: not past day 12 — comfortably clear |
| Salary ratio — optimal (5 checkpoints) | 53.0% flat | 30-55% |
| Salary ratio — human (5 checkpoints) | 54.2% → 55.0% (settles) | 30-55% |
| Flight Data share — sonda (human, median) | 24.4% (range 23.7-24.4%) | 20-35% |
| Flight Data share — satellite (human, median) | 24.7% (range 24.7-24.8%) | 20-35% |

Numbers are unchanged to within rounding from the pre-fix Sprint 7.5 sweep — a
pad-transfer stage is only 5 minutes against a multi-day arc, so a 25% cut to it doesn't
move day-level pacing metrics measurably. No ECONOMY_MODEL value was changed by this run
— reporting only, per standing instruction. Next: Sprint 8 (FTUE & Phase 1 close), per
SPRINTS.md — **holding per explicit instruction, not starting yet.**
