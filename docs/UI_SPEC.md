# UI_SPEC.md — Aurora Program — Interface specification v1
*Web-first (desktop + mobile responsive), Android wrap later reuses the mobile layout.*

**v3.0 changes:** cost/amount rendering rules (§4 — icon+number for costs, $ symbol for Funds, full names only in ticker/tooltips); persistent active-process strip (§2c); staff availability visible from every complex tab (§2).

**v2.8 changes:** no single-letter resource abbreviations in player-facing UI; manual-action cooldowns get visible recharge + acknowledged clicks (§4).

**v3.3 changes:** §4's effect-disclosure rule scoped explicitly to player CHOICES; carve-out added for Probe-1's scripted first certification test (GDD §7) — cost/duration still shown like any process, but no result or Confidence percentage, since there's no choice to inform and no Confidence formula applies to that individual test.

**v2.6 changes:** progressive-disclosure rules added (§2b) — default is hidden-until-relevant; the full content surface is never visible from the start.

**v2.1 changes:** payroll-unpaid ticker state and paused-building indicator added (§4); above-cap display rule added (§2); accent color default set to signal orange (owner may flip to cyan — single CSS variable).

## 1. Visual direction
Dark "control room" theme: near-black panels, one accent color (**default: signal orange** — defined as one CSS variable so switching to cyan is a one-line change), monospace or technical sans for numbers, generous spacing. Flat surfaces, thin borders, no gradients or glow abuse. All growth must be VISIBLE: rolling number animations, buttons that light up the frame they become affordable, progress bars everywhere a timer runs.

## 1b. Achievable visual techniques (code IS the art)
North star: **SPACEPLAN** — a space incremental whose entire aesthetic is procedural SVG, proving code-only visuals can be beautiful. Techniques, in priority order:
1. **Blueprint aesthetic:** rockets and buildings drawn as geometric technical-schematic SVGs — thin lines, engineering-drawing style, stage annotations, dimension marks. Perfectly on-theme (real space programs look like this on paper) and fully code-generatable. Each rocket (S-1, S-2, Aurora I) gets its own blueprint that appears during assembly and on the launch screen.
2. **Technical typography:** a monospace font with tabular figures (JetBrains Mono or IBM Plex Mono via Google Fonts) for ALL numbers — tabular digits stop values "dancing" on every tick and instantly read as control-room.
3. **Animation layer (the real polish budget):** rolling numbers on change, single pulse when something becomes affordable, checkmarks that draw themselves (animated stroke), countdown digits with growing typographic weight. Pure CSS/JS.
4. **One particle moment:** canvas smoke/exhaust particles ONLY during countdown and liftoff — concentrate the special effect on the one moment that earns it.
5. **Subtle background texture:** a faint dark graph-paper grid via CSS pattern for control-room depth.
**Explicitly avoid:** AI-generated raster art (asset inconsistency is the #1 cheapness tell), character illustration, anything 3D, gradient/glow abuse. Coherent restraint beats inconsistent ambition — Universal Paperclips is pure text and iconic.

## 2. Layout skeleton
- **Top ticker (persistent):** Funding, Materials, Hardware, Propellant — value + rate each; capped resources show value/cap and turn amber at ≥90%. **Above cap (one-time payment overflow, GDD §1c): value renders in the accent color with the cap dimmed and a "production paused" microcopy on tap.** Research, Reputation and Flight XP display in a secondary compact row (they update rarely). Hardware shows total; tier breakdown (Al/Ti) on tap once Titanium is researched.
- **Complex tabs (main nav):** Campus · Production · Testing · Launch. Locked tabs greyed with lock icon + unlock condition on tap. On desktop: left sidebar; on mobile: horizontal scrollable tab bar.
- **Building tiles** inside each tab: icon, name, level, production/effect line, upgrade button with cost (disabled+dimmed when unaffordable), progress bar when a process runs, staff slot indicator (2/2 dots). Locked buildings: dashed border + condition.
- **Mission Log:** collapsible bottom panel, last entry always visible as one italic line; expands to scrollable feed. Records board lives as a tab inside this panel.
- **Pending event card:** slides in bottom-right (desktop) / bottom sheet (mobile); two option buttons; never blocks input.

## 2b. Progressive disclosure (what the player can SEE, era by era)
Default rule: **hidden until relevant** — the player never opens the game onto the full content surface. Anticipation is created by a few *deliberate* teasers, not by showing everything greyed out.
- **Complex tabs:** all four visible from the start, locked ones greyed with their unlock condition — this is the intentional "there's more coming" signal, and it's the ONLY place the full breadth is hinted at.
- **Building tiles:** hidden until their complex unlocks. Within an unlocked complex, a tile appears only once its own unlock condition is met, with one designated exception: buildings marked `teaser: true` render locked-with-condition early. v1 teasers: **Training Center only** (the era-2 tease). Payload Processing and Launch Pad B stay completely hidden until Aurora I success — their appearance IS the post-climax "the program is growing" beat.
- **Research nodes:** a node renders only if it's available (deps met) or exactly one prerequisite away. Deeper nodes are fully hidden — the tree reveals itself one ring at a time, Kittens-style. Branch column headers are always visible (the four disciplines are known; their contents are not).
- **Ticker:** starts with Funding only; each resource row appears the first time the player gains (or can produce) that resource. The full 7-resource ticker is itself a progression artifact.
- **Manual verbs:** evolved verbs (Funding Rounds, Rush Order) appear only at their unlock; before that, no greyed button.
- **Records board:** earned records show fully; unearned ones render as dimmed unnamed placeholders ("———") — countable, not readable. Cheap anticipation without spoiling the arc.
- **Contracts panel:** does not exist in the UI until the Launch Rail is built.

## 2c. Active process strip (every timer is always trackable)
Directly under the ticker, a persistent horizontal strip lists **every** running process — research, certification, integration, transfer, training/promotion, contract build, weather window — as compact chips: `[icon] Label · 12m 04s` with a thin progress fill. Rules:
- **No process may exist without a chip.** Building-tile progress bars remain, but they are a convenience duplicate, never the only tracker: processes not tied to a visible tile (promotions above all) would otherwise be invisible, which is the bug this section exists to prevent.
- Tapping a chip jumps to the relevant panel/tile.
- Empty state: the strip collapses to zero height (no "nothing running" row).
- Chips complete with a brief flash, then the result lands in the Mission Log where applicable.
- Sorted by remaining time ascending (next completion first). Beyond 4 concurrent, overflow collapses into a "+N" chip that expands on tap.

**Staff availability everywhere:** every complex tab shows a compact staff chip in its header — `Available: 2 Tech · 1 Eng` (unassigned pool only) — so assignment decisions never require navigating to Campus first. Tapping it opens the staff panel.

## 2d. Campus staged reveal (the "hidden tutorial") & Research panel gating
§2b's "hidden until relevant" rule was written but never given exact per-building conditions for Campus — this section fills that gap. The sequence below IS the FTUE for the opening minutes; each reveal is a direct consequence of the player's last action, never a timer or a tooltip alone.

| Step | Trigger | What appears |
|---|---|---|
| 1 | Game start | Offices only. Ticker shows Funds only. |
| 2 | Lifetime Funding earned ≥ 150 | Finance tile |
| 3 | Finance built (level ≥ 1) | Staff/hiring panel and its ticker access |
| 4 | Staff pool reaches its cap (2/2 at start) for the first time | Crew Quarters AND R&D Lab tiles, together |
| 5 | (unchanged) | Training Center: the one deliberate v1 teaser, always locked-visible from the start (GDD §3) |

**Research panel is hidden entirely until R&D Lab is built (level ≥ 1).** Showing 15 nodes across 4 branches before the player can research anything is exactly the overload this section exists to prevent. Once the panel appears, §2b's existing node-by-node reveal (available or one prerequisite away) applies as already specified.

## 3. Screens
1. **Main dashboard** — ticker + tabs + tiles (above).
2. **Staff panel** (from Campus tab or ticker tap): role pools, hire buttons with next cost, assignment matrix (building × role steppers), salary total/s vs income/s, capacity bar (Quarters).
3. **Research panel — compact tree (v1.1 redesign, replaces the always-expanded card grid):** 4 branch columns, each a vertical chain of SMALL nodes (icon + name only, no inline cost/duration/effect) connected by dependency lines — locked (dim, no icon detail)/available (bright, pulsing border)/in-progress (fill animates with progress)/done (checked, filled). Tapping a node opens a bottom detail sheet (mobile) / side panel (desktop) with its full cost, duration, effect text, and the Start button — only one node's detail is open at a time. This keeps the whole tree visible in the vertical space a single old-style card used to take, while the detail-on-demand pattern avoids the "wall of cards" the owner flagged. One active node — its timer shows in the panel header AND in the process strip (§2c).
4. **Launch Sequence screen** (own full screen, entered from Launch tab when a mission is staged; one instance per pad once Pad B exists, with a pad selector header): mission header, 8-item checklist with real-time states (done ✓ green / active with spinner+timer / pending grey), Confidence % with tap-to-expand breakdown of every term, dominant full-width COUNTDOWN button (disabled until checklist complete; the single largest interactive element in the game), Mission Log strip at the bottom narrating live.
5. **Countdown & result** — full-screen takeover: 10→0 with narrative feed, then result card (success/failure), rewards breakdown (XP, Reputation, Flight Data, Records unlocked), next-objective teaser.
6. **"While you were away"** — modal on open when >5 min elapsed: per-resource gains, processes completed, anything now ready, **and any payroll-stoppage window (start, duration, what was paused)**.
7. **Contracts panel** (appears with the Launch Rail for tier-0 offers; expands with satellite tiers post-Aurora I): offer cards (client, requirements with have/need coloring — including tier badges for Titanium requirements, deadline, pay), active contract with its build/queue status, pad queue visualization (who holds each pad — including Pad B once built).

## 4. States & feedback rules
- **A capped resource always names what raises the cap.** When a resource sits at/near its cap, the ticker's amber warning is tappable and states the specific building/upgrade that raises it (e.g. "Build a Warehouse to raise this cap") — leveling an unrelated building (a common confusion: Finance does not raise the Funding cap, Warehouse does) must never be the only clue.
- **Every consuming building shows its inputs, not just its output.** Fabrication/Refinery-type tiles show a "Consumes: 2 Materials per Hardware" line beside their production line — production without cost is only half the picture.
- **Upgrade buttons preview the NEXT level's delta**, not just the current effect: "Level 16 → +2 Funding/s (currently +30/s)". Answers "why upgrade" at a glance, every level, forever.
- **A node/upgrade with no mechanical effect says so explicitly** — "No other effect — unlocks Titanium research" — never silence. Silence reads as broken, not as "nothing to report."
- **Tier changes get a one-time confirmation.** The instant a new Hardware tier is researched, the ticker's Hardware row becomes tier-aware (breakdown visible) and a one-time toast fires (NARRATIVE §8, T-14) — otherwise "nothing happened" is the correct-but-illegible truth (new Hardware now accrues to the new tier, but nothing may consume it yet).
- **Promotion surfaces its own economic case when it's true.** Hiring cost scales `1.15^hiredOfThatRole` per role while promotion cost is flat — so at higher headcounts, promoting is objectively cheaper than hiring. When that's currently true for a role, the staff panel shows a small hint: "Promoting is cheaper than hiring right now." No value changes — this is surfacing an incentive the numbers already contain, not adding one.
- **Nothing purchasable is offered without stating its effect.** Every building, upgrade and hire shows plain-language copy (NARRATIVE §6) describing what it does, visible BEFORE purchase — on the button, its tooltip, or the tile. A name and a price alone is a spec violation. Items not implemented in v1 (`[v2]` in ECONOMY §4) are not rendered at all — not greyed, not teased. **Scope: this rule covers player CHOICES (upgrades, buildings, hires) — never a scripted narrative outcome.** Probe-1's first certification test (GDD §7, the designed first failure) shows its cost and duration like any process, but never a result or a Confidence percentage — there is nothing to disclose because the player isn't choosing an outcome, and no Confidence formula applies to that individual test (§7b's formula describes the certification as a whole). The surprise is preserved by omission of a result, not by omission of cost.
- **Idle staff must never be a silent trap:** the hiring panel always shows total open slots across the program (T-10); hiring with zero open slots requires acknowledging that the hire will be idle and still paid (T-11); a fully-staffed building explains that slots are fixed and levelling is the way to grow output (T-12). Hiring is never blocked — the player keeps the choice, informed.
- **Cost & amount rendering (systemic rule — replaces the old "no single-letter abbreviations" rule, which treated only the symptom):**
  - **Costs and price tags render as icon + number, with NO resource noun**: `[⚡] 400 · [🔧] 30`. Reading "400 Funding" or "30 Hardware" as a price is the bug — prices carry units, not internal data names.
  - **Funds use the currency symbol `$` as a prefix and no noun at all**: `$400`, `$1.25M`. This is the only resource with a symbol instead of an icon.
  - **Full resource names appear only in the ticker, tooltips, the staff/economy panels, and reward summaries** — places where the player is reading *about* a resource rather than paying with it.
  - Doc-internal shorthand (F/M/H/P) never appears in player-facing UI, ever.
  - Every icon has a tooltip/long-press with the resource's full name — icons alone must never be the only identification.
- **Manual-action cooldowns are always visible and acknowledged:** the button shows a recharge animation (radial or fill) for the cooldown duration, and a click landing during cooldown gives immediate feedback (subtle shake/flash) — a cooldown must read as rhythm, never as a dead button.
- Every affordable action is visually distinct the moment it becomes affordable (border pulse once, then steady highlight).
- Every timer shows remaining time in human units (2h 14m, 45s).
- Every resource deduction/gain animates from the triggering element toward the ticker.
- Milestones: small non-blocking call-out card (title + one Mission Log line), auto-dismisses.
- **Payroll unpaid (GDD §1b):** persistent red "PAYROLL UNPAID" chip in the ticker; every paused staffed building shows a pause icon + "awaiting payroll" microcopy; the chip taps through to the Staff panel. Tooltip T-07 fires the first time. Color is never the only signal (icon + text).
- Confidence <100 at countdown: button shows "Launch at 87%" and requires a confirm tap with the risk stated plainly. No hidden odds, ever. The odds shown are the true committed odds (roll drawn at checklist completion, GDD §7b).
- Empty/locked states always state the unlock condition — never a bare padlock.

## 4b. Staff dismissal (new capability)
The staff panel gains a "Release" action per pool member (unassign first if assigned). No refund of hiring cost — that's the real cost of a hiring mistake, same philosophy as insolvency being self-inflicted-but-recoverable. Salary stops the instant of release; the slot they occupied frees immediately. Confirm-on-click (single tap + inline confirm, not a modal) since it's reversible in spirit (re-hiring is always possible) but irreversible in save state.

## 5. Responsive rules
Desktop (≥1024): sidebar nav, tiles in 2–3 columns, Log docked. Mobile (<768): tab bar, single-column tiles, Log as bottom sheet, Launch screen unchanged (it is already mobile-shaped). Touch targets ≥44 px. The Android wrap (post-launch) reuses the mobile layout as-is.

## 6. Settings screen (v1 — required, not optional)
Accessed from a gear icon in the ticker. Contains: **save export/import** (copy-paste string AND download/upload file — localStorage is fragile and save loss is the #1 killer of long idle games; this ships in v1, not later), manual save button + last-saved timestamp, hard reset (double confirm), sound on/off, reduced motion toggle, number notation (suffix/scientific), **telemetry opt-in checkbox (Sprint 12; plainly worded, off by default)**. Export string is versioned and validated on import with a clear error for corrupt/newer-version saves. (Note: import restores the committed launch roll along with everything else — saves are deterministic snapshots.)

## 7. Accessibility
Contrast AA minimum on all text; color never the only signal (icons + text accompany green/amber/red states); reduced-motion setting disables rolling numbers and pulses; font scaling respected.
