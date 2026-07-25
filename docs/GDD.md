# GDD — Aurora Program
*Final design document for Claude Code development — v2.1 (English base language)*

**v2.6 changelog:** progressive-disclosure rules made explicit (UI_SPEC §2b): default is hidden-until-relevant — building tiles, research nodes, ticker rows, verbs and panels appear as the player earns them; the only deliberate teasers are the locked complex tabs, the Training Center, and unnamed record placeholders.

**v2.2 changelog:** "Launch 1 / 1st launch" wording retired everywhere — all unlocks and records are defined by named event (Payload Processing and Launch Pad B unlock on **Aurora I success**; record triggers per ECONOMY §8b).

**v2.1 changelog (design review fixes):** game named **Aurora Program**; sonda Confidence base 65 (100% now reachable); extended certification exists for EVERY engine (story-mission 100% guarantee holds by construction); failure XP = 80% of the mission's success XP (replaces the inconsistent "double XP"); launch roll committed at checklist completion (anti save-scum); insolvency rule defined (§1b); one-time rewards ignore caps (§1c); Reputation floor 0; salaries also run offline at 60%; Hardware tracked per tier; Flight Data rebalanced to matter (ECONOMY §8); building count corrected to 18 (Launch Rail + Launch Pad B now listed); MissionState is per-pad from day one.

---

## 0. Vision & pillars

A **long, finite, narrative incremental/idle game** in the style of Kittens Game: the player founds and grows a space program from a garage to the Moon (and beyond in future updates). **Web release first**, Android later. **All monetization is post-launch** — v1 ships with zero ad/IAP code.

**Design pillars (every decision is evaluated against these):**
1. Numbers go up and always mean something — every resource has a permanent role
2. Space-program realism — infrastructure IS the game; launching requires a real chain of facilities and processes
3. Kittens pacing — real-time processes (minutes → hours → days); played in short sessions over weeks
4. Narrative told through unlocks — Mission Log (text), no cutscenes
5. Manual first, automated later — automation is earned
6. Everything interlocks — every system feeds or consumes at least two other systems

**Closed decisions (do not re-litigate):**
- NO reset prestige. Meta-progression = Flight Experience (permanent) + Reputation + eras. Optional future valve documented ("rocket generations") only if playtests show stagnation.
- Commercial contracts IN v1, after the first launch.
- Hybrid staff: role pools + individual astronauts (era 2; data model designed now).
- English is the base language. All game text lives in NARRATIVE_EVENTS.md, referenced by ID (i18n-ready by construction).
- Monetization (design notes in §13) is entirely post-launch.

**KSP validation note:** Kerbal Space Program's career mode runs on the exact same resource triad (funds / science / reputation) with contracts at its heart and reputation gating better contracts — strong independent validation of this design. Ideas converted from KSP are marked ⟨KSP⟩ below.

---

## 1. Resources (8)

| Resource | Sources | Sinks | Cap |
|---|---|---|---|
| Funding | Manual pitch → Finance (passive) → Contracts, Records | Construction, salaries (recurring), hiring, upgrades | Warehouse |
| Research | R&D Lab (staff) + **Flight Data from every launch/test** ⟨KSP⟩ | Tech tree + per-mission flight review (recurring) | — |
| Materials | Manual gathering → Supply Depot | Fabrication, Refinery | Warehouse |
| Hardware | Fabrication (tiers: Aluminum→Titanium→Composites) | VAB stage integration, contracts | Warehouse |
| Propellant | Refinery (continuous) | Every launch and engine test (recurring) | Propellant Depot (own cap) |
| Staff | Hiring | Building assignment; salaries scale by role | Crew Quarters |
| Reputation | Mission milestones, contracts, **Program Records** ⟨KSP⟩ | Gates: big funding rounds, better candidates, premium contracts; lost on failed deadlines. **Floor: 0 (never negative).** | — |
| Flight Experience | Launches/tests (× Tracking multiplier) | Permanent efficiency trees | — |

**Hardware tiers:** Hardware is tracked **per tier** (Aluminum, Titanium; Composites v2) sharing a single Warehouse cap. Recipes and contracts may require a minimum tier (e.g. tier-2 contracts require Titanium Hardware). Fabrication produces at its current tier. *(Staff is managed via its own StaffState, not as a numeric ResourceState — see CLAUDE.md.)*

**Anti-obsolescence rules:** salaries scale with role and headcount; Propellant and flight review are per-mission costs; Fabrication tiers raise the value of the same chain instead of replacing it; **Flight Data makes every mission feed the tech tree directly** (closes the loop Research↔Missions). Design target: Flight Data = 20–35% of total Research income during flight eras (human profile, per era) — verified in the balance simulator (SPRINTS Sprint 0).

**Evolving manual verbs (prevents early actions going dead):** the manual pitch evolves at Reputation thresholds into **Funding Rounds** (bigger yield, longer cooldown, Reputation-gated) — the "ask investors for money" verb stays alive from garage pitch to Series C. Manual gathering evolves into **Rush Orders** (instant Materials for Funding, cooldown) — the active option for impatient moments, forever.

## 1b. Insolvency rule (Funding = 0 with salaries due)

When Funding hits 0 and salaries cannot be paid: **all staffed production pauses** (work stoppage), a persistent "PAYROLL UNPAID" state shows in the ticker, and unpaid buildings display a paused indicator. Staff never quit and no debt accumulates — manual verbs (pitch / Funding Rounds / Rush Orders) remain available and are the thematic bail-out: the founder goes back to pitching. Production resumes automatically the tick salaries can be paid again. The exact same rule applies during offline resolution (the "While you were away" screen reports the stoppage window).

## 1c. Caps & one-time payments

Passive/continuous production **halts at cap** (amber warning). **One-time payments — Records, contract payouts, Funding Rounds, event rewards, narrative rewards — ignore caps** and may push a balance above its cap; while above cap, passive production of that resource remains halted until the balance drops below cap. No reward is ever silently lost.

---

## 2. Staff — hybrid system

**Role pools** (numbers, not individuals): Technicians, Engineers, Scientists, Controllers.
- Hired directly or **promoted** between roles via training (timed process; Quarters "Classroom" upgrade in v1)
- Buildings define slots per role; production scales with filled ratio
- Salary per tick scales by role; hiring cost `base × 1.15^hiredOfThatRole` (exponent is **per role**, not global)

**Individual astronauts** ⟨KSP astronaut XP/specialization⟩ (era 2 — data model defined NOW):
`{ id, name, originRole, skill (grows per mission flown), status, missionsFlown }` — Training Center visible-but-locked in v1; save schema ships with `astronauts: []`.

*(Special-staff events like E-04 are implemented as pool +1 plus a permanent salary modifier via `core/modifiers.ts` — never as tracked individuals inside a pool.)*

---

## 3. Buildings (18, in 4 complexes) + internal upgrades

Complexes unlock in order and are the UI tabs (see UI_SPEC.md).

**Complex A — Campus:** Offices (manual pitch/Funding Rounds; admin) · Finance (passive Funding) · R&D Lab (Research) · Crew Quarters (staff cap; Classroom/Cafeteria upgrades) · Training Center *(locked v1)*

**Complex B — Production:** Supply Depot (Materials) · Fabrication (Materials→Hardware, tiers) · Refinery (Materials→Propellant) · Warehouse (general caps) · Propellant Depot (Propellant cap, separate facility)

**Complex C — Testing:** Engine Test Stand (mandatory certification per engine type; consumes Hardware+Propellant+time; hosts the sonda assembly workshop) · **Launch Rail** (launches sounding rockets; Extended Rail upgrade enables S-2) · Payload Processing *(unlocks after Aurora I success; required by satellite contracts)*

**Complex D — Launch:** VAB (stage integration: Structure→Engines→Guidance→Final integration) · Launch Pad (Service Tower / Flame Trench / Sound Suppression upgrades) · **Launch Pad B** (second independent pad; unlocks after Aurora I success, Reputation-gated) · Launch Control (Controller minimum to launch) · Tracking Station (orbital requirement; level multiplies Flight Experience earned; Radar/Antenna Network/Weather Station upgrades)

All base costs, growth factors, production values, slots and internal upgrades: ECONOMY_MODEL.md §4.

---

## 4. Time system — the backbone of Kittens pacing

Every significant process has a real-time duration (reference scale in ECONOMY_MODEL §"Timers"): certification 25 min → 8 h, VAB stages 10 min → 4 h each, training 15 min → 12 h, research nodes 3 min → 6 h, contracts 4–24 h cycles, weather window 2–5 min.

Rules: processes run at 100% while offline (resources **and salaries** at 60%, 10 h cap — extendable to 16 h via the Remote Ops research node); there must always be ≥2 available actions while timers run (audited in playtest); long timers have NO paid skip in v1 (web) — the Weather Station upgrade and Operations research are the only accelerators. A weather window pending when the game closes resolves on reopen with the same timestamp logic as every other process.

---

## 5. Research — four interlocked branches

- **Materials**: Aluminum → Titanium (→ Composites v2) — better Hardware, required by higher engines
- **Propulsion**: engine types (each must be certified at the Test Stand); gates each rocket class
- **Operations**: automation (VAB queues, auto-refuel, express re-certification), logistics, **Remote Ops (offline cap 10 h → 16 h)** — the manual→automated arc is literally a branch
- **Program**: unlocks buildings, mission classes, and (era 2) the crewed program

Research inflow now includes **Flight Data** from every test and launch ⟨KSP science-from-missions⟩ — late-game research is funded by flying, not only by lab idle time. Flight Data values are sized to pay for meaningful tech nodes (ECONOMY §8), not decorative trickle.

---

## 6. Commercial contracts ⟨KSP contracts⟩

**Tier 0 (from the Launch Rail):** single rotating offer — fly a client's instrument package on an S-1. The early program's financial engine. Cost is **all-inclusive** (rocket + payload; exact split in ECONOMY §10).
**Satellite tiers (post-Aurora I):** 2 active offers rotating every 8 h; tier 1 = single satellites (comms, science, observation); tier 2 (Clean Room) = **internet constellation batches** — the recurring, lucrative client class that keeps demanding launches (templates: ECONOMY_MODEL §10; clients: NARRATIVE_EVENTS §4). Tier 2 requires Titanium-tier Hardware.

Core tension: contracts share pads and the VAB with story missions — the player manages the pad queue (relieved, at a price, by Launch Pad B). Declining is free (v1); failing a deadline costs Reputation (floor 0). **Known KSP failure mode to avoid:** late-career contracts get samey/grindy — mitigations: distinct tier requirements, deadlines that force queue decisions, constellation clients giving multi-launch continuity, and Confidence gambling (§7b) as the skill expression.

---

## 6b. Mission ladder (v1 arc — sounding rockets first)

The program climbs the way real ones did (CONAE, PLD Space and early NASA all began with sounding rockets):

1. **S-1 sounding rockets** — cheap suborbital rockets launched from a simple Launch Rail, carrying research instruments and tech demos for universities and labs. Repeatable, quick, and they PAY: tier-0 payload contracts fund the early program. This puts the launch loop (mini-checklist → countdown → rewards) in the player's hands hours earlier, and fills the "valley" between the first hour and the big rocket.
2. **S-2 high-altitude** — extended rail, bigger sonda: **past the Kármán line** (Program Record). The company officially reaches space.
3. **Aurora I — first satellite** (orbital): the full-infrastructure climb (VAB, Pad, Tracking, complete checklist, Orbital-1 engine). The v1 climax — and the mission the program is named after.
4. **Multiple satellites** — tier 1/2 contracts led by **internet constellation clients** (a constellation needs MANY launches — the perfect justification for repeat missions and Launch Pad B) + other payloads (comms, science, observation).
5. **Crewed missions** — era 2 (post-launch).

Each rung justifies the financing of the next — sounding-rocket payload contracts fund the space attempt, the Kármán milestone unlocks the Reputation for satellite-scale funding rounds, internet-constellation contracts fund the crewed program.

---

## 7. Launch Sequence (signature mechanic)

Real-time checklist, own dominant screen: 1 Rocket integrated (VAB) · 2 Engines certified · 3 Transfer to pad (timer) · 4 Propellant loaded · 5 Flight review (Research spend) · 6 Controllers on station · 7 Tracking active (orbital missions) · 8 Weather window (short variable timer) → **COUNTDOWN** (dominant button).

**Designed first failure:** the FIRST static fire at the Test Stand always fails (scripted): recovers part of the Hardware, grants the first Flight Experience, fires narrative beat N-07. The first actual rocket launch CAN be guaranteed — the player already "paid" their failure.

## 7b. Launch Confidence (success probability with agency)

Visible percentage on the checklist. Golden rule: **risk is always chosen, never imposed** — 100% is always reachable by investing more; launching below it is a deliberate gamble.

```
Confidence = 40 (base)
 + 20 standard engine certification  (or +30 extended: one extra test — EVERY engine type has an extended certification, by rule)
 + 15 flight review approved
 + 10 controllers fully staffed (proportional)
 +  5 Service Tower built
 +  5 waiting for optimal weather window (0 if launched early)
 + Flight Experience bonus: +1 per 50 XP (cap +15 in v1)
→ capped at 100
```

With extended certification the deterministic terms alone total 105 → **100% is reachable with zero XP, guaranteed, for every story mission** — the guarantee no longer depends on the player's XP balance.

**Roll commitment (anti save-scum):** the success roll is drawn and stored in the save the moment the checklist completes (not when the countdown button is pressed). Export/reimport does not re-roll. Odds shown are always the true odds.

Failure resolution (single committed roll): recover 60% of Hardware as analyzable debris, earn **Flight XP equal to 80% of that mission's success XP**, re-integration runs at 50% duration; no Reputation, no contract payout. Failure costs time and Propellant, never leaves the player worse than before building the rocket — but gambling trades expected value for speed, it never beats investing in Confidence. Story missions: 100% always reachable. Contracts: the natural gambling space. This mechanic IS era-2 crewed Safety, extended.

---

## 8. Program Records ⟨KSP world-firsts⟩

Micro-milestones awarded automatically the first time each threshold is crossed, granting Funding + Reputation (table: ECONOMY_MODEL §8b; payouts ignore caps per §1c): first ignition, first flight, past the Kármán line, first orbit, first customer, first delivery. Cheap (pure data), adds constant near-term goals between story beats, and reinforces the "program history" fantasy. Displayed as a Records board in the Mission Log panel.

---

## 9. Flight Experience — deep trees (the prestige replacement)

Earned per test/launch/contract (× Tracking multiplier). Four permanent trees (ECONOMY_MODEL §9); depth rule: every tree has at least one node that **changes a mechanic** (VAB queues, partial reusability, parallel integration), not just a percentage.

---

## 10. Narrative & events

Mission Log: scripted beats by trigger (NARRATIVE_EVENTS §1, English). Light random events every 30–90 active minutes, always a 2-option choice, never during countdown (NARRATIVE_EVENTS §3). Program Records feed the log too.

---

## 11. FTUE & session targets

First decision <30 s (pitch → first hire). Progressive complexity: locked complex tabs greyed with visible condition — and beyond the tabs, **hidden-until-relevant is the default for everything** (buildings, research nodes, ticker rows, verbs, panels; full rules in UI_SPEC §2b): the player starts with one building, one button, one resource, and discovers the rest by earning it. Designed end of session 1: something producing + a timer running. Funnel instrumented via telemetry middleware. Session table (day-by-day arc to first launch): SPRINTS.md Sprint 8 acceptance.

---

## 12. UI

Full specification in **UI_SPEC.md** (screens, components, states, visual direction). Summary: persistent 4-resource ticker; complex tabs with building tiles; dedicated Launch Sequence screen with dominant countdown button; collapsible Mission Log panel; storage bars for capped resources; insolvency and above-cap states specified in UI_SPEC §4.

---

## 13. Post-launch (documented, NOT built in v1)

- Android wrap (Capacitor); rewarded-ads-only monetization: 2× offline claim, weather-window skip, timer −25% skip; single "Remove Ads" IAP. No forced interstitials, ever. Every upgrade description states exactly what it does.
- Era 2: crewed program (astronauts active, endurance/EVA/docking missions, Safety = Confidence extended), Moon, station, Mars.
- Program Policies ⟨KSP Administration strategies⟩: active policy slots trading income types (e.g. "Media partnership: +Reputation, −contract pay").
- Rocket generations (soft prestige valve) — only if playtest data shows mid-game stagnation.
- Booster recovery ⟨KSP recovery⟩ as an extension of the Reusability XP node.
