# ECONOMY_MODEL.md — Aurora Program — Complete baseline numbers
*Every value in the game. Claude Code does NOT invent numbers: if a value isn't here, ask and add it here first. Tick = 1 second (logical economy rate; the render loop is delta-based per CLAUDE.md rule 6). Baseline for the Sprint-0 headless simulator (`sim/run.ts`); adjust only via the simulator, updating this file.*

**v3.2 changes (upgrade audit):** Radar clarified as part of the base Tracking Station (not purchasable); v2-only upgrades marked [v2] and explicitly not rendered in v1; player-facing upgrade copy now mandatory (NARRATIVE §6, UI_SPEC §4). No values changed.

**v3.1 changes (design review — scoped economy unlock, item-limited):** tier-0 contract Confidence clarified (sonda formula, 100% reachable); Clean Room naming collision resolved (tier renamed "constellation batches"; the VAB upgrade is a real tier-2 prerequisite); Reputation gates added to satellite tiers (tier 1 ≥ 20, tier 2 ≥ 50 — safety nets, sim-verified at Sprint 9); contract launch failure vs missed-deadline penalty disambiguated; Rush Order gate rationale confirmed. **This is a SCOPED unlock for these items only — the rest of the economy stays locked and no existing value changed.**

**v3.0 changes (presentation):** player-facing display names & cost rendering defined (§12) — Funds shown as $, costs as icon+number, no resource nouns in price tags. Presentation only: no ResourceId, value, or balance change; economy lock unaffected.

**v2.9 changes (Sprint 4 blocker):** Aluminum node disambiguated (§5) — renamed "Aluminum alloys", explicitly no production effect, explicitly NOT a gate on the Aluminum tier (which needs no tech, ratifying Sprint 3's `currentHardwareTier`); it exists as the Materials branch entry and Titanium's prerequisite.

**v2.8 changes (owner manual-play findings + ratification):** multi-role staffRatio defined as bottleneck (min across roles) — ratifying the Sprint 3 implementation; staff slots exist only at building level ≥ 1 (assignment to unbuilt buildings was a bug); player-facing UI never shows single-letter resource abbreviations (UI_SPEC §4); pitch cooldown gets visible recharge feedback (UI_SPEC §4) — the 1 s cadence itself stays (economy lock); dev-only reset button added ahead of Sprint 8's real one.

**v2.7 changes (semantics, NOT a balance unlock — no values touched):** tick resolution order and starvation/contention rules defined (§4b) — binary per-building starvation pause, fixed consumer claim order, salaries resolve first.

**v2.5 changes (multi-seed sweep, seeds 1–10 × 45d):** Flight Data ×~1.7 across the board (median era shares were 14.7%/15.9% vs the 20–35% target — decision rule's "raise Flight Data, don't touch the lab" branch applied); salary sanity band widened to 30–55% (settling at ~53–55% is intended pressure — the insolvency mechanic exists to make it interactive — not a miss); day-1 `basicEngineering` stall accepted as bootstrap pacing with a contingent FTUE fix parked in BACKLOG and tooltip T-09 added.

**v2.4 changes:** contract rewards specified per tier (the §8 range left tier assignment open to interpretation — surfaced when the sim had to pick a value); contract Reputation in §8 now defers to §10 (the old +10–25 range contradicted tier-0's 3 Rep).

**v2.3 changes (sim-driven rebalance):** R&D Lab 0.1 → 0.03 R/s per level and Flight Data values raised ~1.5× — the v2.1 rebalance was insufficient (human-profile sim measured Flight Data at ~2% of Research income vs the ≥25% target; a 24/7 lab vs a few flights/day could never hit it at 0.1 R/s). Target reformulated as a per-era range (§8). Pacing floor codified: human profile must not reach Aurora I before simulated day 5.

**v2.2 changes (Sprint-0 findings):** pitch yield unified to one formula (§2); starting staff cap documented (§1); promotion-bootstrap note added (§3); Aurora I payload/flight-review durations defined (§7); number formatting rule = 3 significant figures (§12); Program Record triggers redefined by event, not launch number (§8b).

**v2.1 changes:** salaries retuned (were decorative at 5% of income); R&D Lab rate cut 0.4 → 0.1 R/s per level and Flight Data multiplied ~10× so missions genuinely fund research; sonda Confidence base 65; Orbital-1 extended certification added; failure XP = 80% of mission success XP; tier-0 contract cost defined as all-inclusive; Remote Ops research node added (offline cap 16 h); insolvency/offline-salary/cap-overflow rules referenced from GDD §1b–1c.

## 1. Starting state
Funding 0 · Materials 0 · Research 0 · Hardware 0 (Aluminum tier) · Propellant 0 · Reputation 0 · Flight XP 0. Buildings: Offices lv1 (free, pre-built). Staff: 0. **Starting staff cap: 2** (before any Crew Quarters; Quarters adds +3 per level). Initial caps (no Warehouse): Funding 500 · Materials 200 · Hardware 50 · Propellant 0 (requires Propellant Depot).

## 2. Manual actions (evolving verbs)
| Action | Yield | Cooldown | Unlock / evolution |
|---|---|---|---|
| Pitch investors | `10 + 5 × (Offices level − 1)` Funding (lv1 = 10, lv2 = 15, lv3 = 20…) — the ONLY pitch formula; §4's Offices row is a reference to this | 1 s | Start |
| Funding Round I | 500 Funding | 10 min | Reputation ≥ 25 (replaces nothing; pitch stays) |
| Funding Round II | 2,500 Funding | 30 min | Reputation ≥ 75 |
| Gather materials | 5 Materials | 1 s | Supply Depot lv1 |
| Rush Order | 100 Materials for 150 Funding | 5 min | Fabrication built *(intentional: the verb evolves when Materials become a real bottleneck — i.e. when something consumes them — not when the Depot is built)* |

Funding Round payouts are one-time payments: they **ignore the Funding cap** (GDD §1c).

## 3. Staff — hiring cost `base × 1.15^hiredOfThatRole` (exponent per role), salary per second per unit
| Role | Base cost | Salary/s | Unlock |
|---|---|---|---|
| Technician | 50 | 0.15 | Start |
| Engineer | 150 | 0.35 | Tech: Basic engineering |
| Scientist | 400 | 0.60 | Tech: Scientific method |
| Controller | 250 | 0.35 | Tech: Flight operations |

Promotions (Quarters "Classroom"): Tech→Engineer 100 F + 15 min · Engineer→Scientist 300 F + 45 min.
**Bootstrap rule:** role-unlock techs gate *direct hiring only*; promotions are gated only by the Classroom. This is the intended Research bootstrap — with zero Scientists (and no tech researched), the player hires Technicians and promotes their way to the first Scientist to staff the R&D Lab. Do not add tech requirements to promotions.
Sanity rule: total salaries = 30–55% of passive Funding income at 5 checkpoints of the arc — **verified by `sim/run.ts` at each checkpoint, not by hand**.
Insolvency behavior (Funding 0, salaries due): GDD §1b — staffed production pauses, no debt, no quitting, manual verbs remain. Applies identically offline.

## 4. Buildings — cost `base × factor^level`; production `base × level × staffRatio`
**staffRatio for multi-role buildings = the MINIMUM filled ratio across its roles (bottleneck rule):** Fabrication with its Engineer slot filled but no Technician produces 0 — a missing discipline halts the line, consistent with §4b's binary philosophy. **Slots exist only at building level ≥ 1** — an unbuilt (level 0) building has no slots and must not appear as an assignment target; hiring into the pool without an assignment is always allowed (Quarters cap is the only limit).
### Complex A — Campus (unlocked at start)
| Building | Base cost | Factor | Effect | Slots |
|---|---|---|---|---|
| Offices | upgrades: 100 F | 1.12 | Pitch yield per §2 formula (+5 Funding/pitch per level above lv1) | — |
| Finance | 150 F | 1.14 | +2 Funding/s per level | 2 Tech |
| R&D Lab | 250 F | 1.14 | +0.03 Research/s per level | 2 Sci |
| Crew Quarters | 120 F | 1.08 | +3 staff cap per level | — |
| Training Center | — | — | LOCKED v1 (visible) | — |

### Complex B — Production (unlock: lifetime Funding earned ≥ 300)
| Building | Base cost | Factor | Effect | Slots |
|---|---|---|---|---|
| Supply Depot | 200 F | 1.13 | +1.5 Materials/s per level | 2 Tech |
| Fabrication | 350 F + 100 M | 1.15 | +0.3 Hardware/s per level (consumes 2 M per Hardware; produces at current tier) | 1 Eng + 1 Tech |
| Refinery | 300 F + 80 M | 1.14 | +0.5 Propellant/s per level (consumes 1 M per unit) | 1 Eng |
| Warehouse | 250 F + 50 M | 1.07 | +500 F / +300 M / +75 H cap per level | — |
| Propellant Depot | 400 F + 120 M | 1.07 | +250 Propellant cap per level | — |

### Complex C — Testing (unlock: tech "Test stand")
| Building | Base cost | Factor | Effect | Slots |
|---|---|---|---|---|
| Engine Test Stand | 800 F + 300 M + 40 H | 1.20 | Enables certifications (§6) + sonda assembly workshop | 2 Eng + 1 Tech |
| Launch Rail | 300 F + 100 M | one-time | Launches sounding rockets (mini-checklist §7a). Upgrade: Extended Rail 400 F + 100 M (enables S-2) | 1 Tech |
| Payload Processing | 1,500 F + 200 H | 1.20 | Enables satellite contracts (post-Aurora I) | 1 Eng + 1 Sci |

### Complex D — Launch (unlock: tech "Flight program")
| Building | Base cost | Factor | Effect | Slots |
|---|---|---|---|---|
| VAB | 2,000 F + 500 M | 1.25 | Stage integration | 2 Eng + 2 Tech |
| Launch Pad | 1,500 F + 400 M | 1.25 | Transfer & launch | 1 Tech |
| Launch Control | 1,000 F + 200 M | 1.20 | Countdown | 3 Ctrl |
| Tracking Station | 1,200 F + 250 M + 30 H | 1.20 | +25% Flight XP per level; mission-2 requirement | 1 Sci |
| Launch Pad B | 6,000 F + 1,500 M + 100 H | — (one-time) | Second pad: contracts and story missions can stage in parallel (each pad has its own queue, transfer, and weather window). **Unlocks after the first successful orbital launch (Aurora I success) + Reputation ≥ 40** — "Launch 1" wording is retired everywhere; unlocks are defined by event, same rule as §8b. Requires 1 additional Technician slot and its own Service Tower purchase for the +5 Confidence. | 1 Tech |

### Internal upgrades (one-time)
*Player-facing copy for each: NARRATIVE_EVENTS §6. Items marked **[v2]** are NOT implemented and NOT rendered in v1 — not greyed, not teased.*
Launch Pad: Service Tower 800 F+150 M (+5 Confidence) · Flame Trench 1,200 F+300 M (−30% pad turnaround) · **[v2]** Sound Suppression (heavy class)
Test Stand: Instrumentation 600 F+20 H (−25% certification time) · **[v2]** Cryogenic Stand (tier-2 engines)
Tracking: Antenna Network 1,500 F+50 H (+25% Flight XP) · Weather Station 900 F+25 H (windows every 2 min). *(Radar is part of the base Tracking Station — it is NOT a purchasable upgrade and must not appear in the upgrade list.)*
VAB: Clean Room 2,200 F+70 H (required for constellation-batch contracts, §10) · **[v2]** Heavy Crane (large stages)
Quarters: Classroom 400 F (enables promotions) · Cafeteria 700 F (−10% effective salaries)

## 4b. Tick resolution order, starvation & contention
Every economy tick resolves in this fixed order:
1. **Salaries** deduct first (staff get paid before work happens). If Funding can't cover them → insolvency per GDD §1b: ALL staffed production pauses this tick, no salary deducted.
2. **Pure producers** add output (Finance, Supply Depot, R&D Lab) — subject to caps (production halts at cap).
3. **Consumers** claim inputs **in the order their buildings appear in the §4 tables, top to bottom** (v1: Fabrication, then Refinery). Each either receives its FULL tick requirement or is **starved: binary pause, zero production that tick** — never partial, never negative. Same pattern as the insolvency pause.

Starvation is per building, per tick, and self-recovers the moment inputs suffice (no manual reset). UI: the paused indicator appears immediately on a starved tick and clears after 3 consecutive fed ticks (hysteresis prevents flicker when supply hovers at the boundary).

**Player priority lever (by design, no priority UI in v1):** staffing IS the priority control — an unstaffed consumer neither produces nor claims inputs, so redirecting Materials (e.g. to stockpile Propellant before a launch) is done by unassigning Fabrication staff. Offline resolution uses these exact same rules (same functions, per CLAUDE.md rule 6).

## 5. Research tree v1 (cost in Research, real-time duration)
Materials: **Aluminum alloys** (25 R, 5 min — *branch entry node: no production effect in v1; the Aluminum Hardware tier is available from the start with NO tech required. Its function is to gate Titanium and to be an early, affordable teaching node. Flavor: certifying aluminum stock for flight hardware*) → Titanium (400 R, 3 h)
Propulsion: **Sounding rockets (20 R, 4 min)** → Probe-1 engine (40 R, 10 min) → Orbital-1 engine (500 R, 4 h)
Operations: Basic logistics (60 R, 15 min: transfer −25%) → **Remote Ops (120 R, 45 min: offline cap 10 h → 16 h)** → VAB queues (350 R, 2 h: auto-queue stages) → Auto-refuel (600 R, 5 h)
Program: Basic engineering (15 R, 3 min) → Scientific method (80 R, 20 min) → Test stand (150 R, 40 min) → Flight operations (250 R, 1 h) → Flight program (400 R, 2 h) → Orbital flight (700 R, 6 h)

## 6. Engine certification (Test Stand)
| Test | Consumes | Duration | Result |
|---|---|---|---|
| Probe-1, test 1 | 10 H + 50 P | 25 min | **SCRIPTED FAILURE**: +30 XP, +250 Flight Data, recover 6 H, beat N-07 |
| Probe-1, test 2 | 8 H + 50 P | 25 min | Guaranteed success → certified (powers S-1/S-2) |
| Probe-1 extended certification (optional) | 8 H + 50 P | 25 min | +30 Confidence instead of +20 |
| Orbital-1 (Aurora I) | 25 H + 150 P | 3 h | 80% success; failure grants +60 XP, retry at half duration |
| Orbital-1 extended certification (optional, after base cert) | 20 H + 120 P | 2 h | +30 Confidence instead of +20 (guaranteed success) |

Rule: **every engine type, present and future, has an extended certification** — this is what makes the "100% always reachable" guarantee structural (GDD §7b).

## 7a. Sounding rockets (Launch Rail — the early launch loop)
| Rocket | Assembly (Test Stand workshop) | Launch consumes | Mini-checklist | Result |
|---|---|---|---|---|
| S-1 sounding rocket (research payloads) | 8 H, 10 min | 30 P | Assembled · Propellant · Weather window | Repeatable; fulfills tier-0 contracts; +15 XP, +200 Flight Data per flight |
| S-2 high-altitude | 20 H, 25 min (needs Extended Rail) | 80 P | Same + flight review (20 R) | **Past the Kármán line** record; +50 XP, +10 Rep, +1,000 Flight Data |

Sonda Confidence (simplified): **base 65** + certification (+20 / +30 extended) + optimal weather (+5). 65+30+5 = **100 reachable, guaranteed** — teaching the mechanic small before Aurora I. Same roll-commitment rule as full launches (GDD §7b).

## 7. Aurora I (first satellite — v1 climax) — VAB integration
Structure 30 H, 20 min → Engines (Orbital-1 certified) 20 H, 15 min → Guidance 15 H + 30 R, 15 min → Satellite payload 15 H, **15 min** (Payload Processing not required for own satellite) → Final integration 10 H, 10 min → Pad transfer 5 min → Propellant load 400 P, 3 min → Flight review 50 R, **instant** (pure Research spend, no timer — this applies to all flight reviews, S-2's included). Requires: Orbital flight tech + Tracking Station active + full checklist (GDD §7). **Note: the 400 P load requires Propellant Depot lv2 (cap 500) — surfaced to the player via tooltip T-08 when the VAB build starts.**

## 8. Launch rewards (Flight XP × Tracking multiplier; Flight Data = Research; one-time Funding/Rep payouts ignore caps)
| Event | Flight XP | Reputation | Flight Data (R) |
|---|---|---|---|
| Static fire success | +15 | +2 | +150 |
| Scripted failure (N-07) | +30 | +1 | +250 |
| S-1 sonda flight | +15 | +1 | +200 |
| S-2 Kármán flight | +50 | +10 | +1,000 |
| Aurora I (first satellite) | +250 | +60 | +2,000 |
| Launch failure (confidence <100) | **80% of that mission's success XP** | 0 | 60% of that mission's success Flight Data |
| Contract fulfilled | tier-0 +40 · tier-1 +60 · tier-2 +80 | per §10 (3 / 10 / 25) | tier-0 +450 · tier-1 +600 · tier-2 +750 |

Design targets (checked in `sim/run.ts`, human profile, reported per era): **Flight Data = 20–35% of total Research income during the sonda and satellite eras** (pre-flight era is naturally lab-only); **pacing floor: the human profile must not reach Aurora I before simulated day 5.** Failure never pays contract money or Reputation — gambling saves time, it never beats investing in Confidence on expected value.

## 8b. Program Records (auto-awarded, once each; payouts ignore caps)
Triggers are defined **by event, never by launch number** ("Launch 1/2" wording from the pre-sonda arc is retired — with sondas in the ladder, launch numbers are ambiguous):

| Record | Trigger | Reward |
|---|---|---|
| First ignition | First static fire (even the scripted failure) | 200 F + 3 Rep |
| First flight | First S-1 sonda launch (pairs with beat N-08b) | 500 F + 5 Rep |
| Past the Kármán line | First S-2 success (pairs with beat N-08c) | 1,000 F + 8 Rep |
| First orbit | Aurora I success (pairs with beat N-11) | 3,000 F + 15 Rep |
| First customer | First contract accepted | 400 F + 3 Rep |
| First delivery | First contract fulfilled | 1,500 F + 10 Rep |

## 9. Flight Experience trees (XP cost)
Propulsion: Efficient mixtures (100: −10% Propellant/launch) → Optimized ignition (250: certification −20%) → Partial reusability (600: recover 20% Propellant — mechanic change)
Operations: Procedures (100: integration −10%) → Turnaround (300: pad ready −30%) → Parallel integration (700: two stages at once — mechanic change)
Organization: Team culture (150: salaries −5%) → Recruiting (400: hiring −15%)
Prestige: Public relations (150: +20% Reputation) → Trusted brand (450: contracts pay +25%)

## 10. Contracts
**Tier 0 — sounding payloads** (active from Launch Rail; no Payload Processing needed): 1 active offer, rotates 6 h. "Fly [client]'s instrument package on an S-1". **Total all-inclusive cost 10 H + 40 P** = the standard S-1 (8 H assembly + 30 P launch) **plus** client payload integration (2 H + 10 P). Deadline 12 h, pays 400 F + 3 Rep. Research payloads fund the space attempt. **Confidence: tier-0 flies an S-1 and therefore uses the sonda formula (§7a) — 100% IS reachable with extended certification, exactly like a story sonda.** Tier-0 teaches the contract loop safely; it is not the gambling space.

**Satellite tiers** (post-Aurora I; 2 active offers, rotate 8 h; require Payload Processing):
| Tier | Client class | Requires | Deadline | Pays |
|---|---|---|---|---|
| 1 | Single satellites (comms, science, observation) | 40 H + 250 P + pad slot + **Reputation ≥ 20** | 24 h | 3,000 F + 10 Rep |
| 2 — constellation batches | **Internet constellation batches** — recurring client, repeat offers | 80 H **Titanium tier** + 400 P + **VAB Clean Room upgrade** (§4) + **Reputation ≥ 50** | 36 h | 8,000 F + 25 Rep |

*Reputation gates are safety nets, not pacing gates: clean play accumulates ~105 Rep by Aurora I, so they bind only for players who burned Reputation on missed deadlines or bad event choices. Same intent as Launch Pad B's Rep ≥ 40. Verify in the sim at Sprint 9 that they never block clean play.* The VAB "Clean Room" upgrade is a **real prerequisite** for tier 2 (it was already annotated as such in §4) — the tier is named "constellation batches", not "Clean Room", to end the naming collision.

Missed deadline: −15 Reputation (floor 0). Declining: free (v1). **A contract launch that FAILS its Confidence roll costs no Reputation by itself (GDD §7b) and does NOT cancel the contract — it stays active until its deadline, so the player may rebuild and retry. The −15 applies only if the deadline actually passes unfulfilled.** Satellite-tier contracts use the full launch checklist with Confidence (no cheap 100% guarantee — that's the gamble; roll committed at checklist completion).

## 11. Offline, events, weather
Offline: 60% of active rates **including salaries**, 10 h cap (16 h with Remote Ops); process timers run at 100%; insolvency resolved with the same rule as online (GDD §1b) and reported in the summary. **No paid skips in v1.**
Random events: 15% check every 10 active min; ≥30 min between events; pool in NARRATIVE_EVENTS §3.
Weather window: uniform 2–5 min (fixed 2 min with Weather Station); a pending window at close resolves by timestamp on reopen.

## 12. Number formatting & player-facing names
Suffixes from 10,000, always **3 significant figures**: 10.0K, 125K, 1.25M, 3.10B. Rates 1 decimal. Percentages integers.

**Display names (presentation layer only — `ResourceId` values are unchanged, saves and sim unaffected):**

| ResourceId | Player-facing name | As a cost | In the ticker |
|---|---|---|---|
| funding | Funds | `$400`, `$1.25M` | `$1.25M` |
| materials | Materials | icon + `200` | `Materials 200` |
| hardware | Hardware | icon + `30` | `Hardware 30` (tier split on tap) |
| propellant | Propellant | icon + `400` | `Propellant 400` |
| research | Research | icon + `25` | `Research 25` |
| reputation | Reputation | — (rarely spent) | `Reputation 12` |
| flightxp | Flight Experience | icon + `250` | `Flight XP 250` |

Rendering rules (icon-only in costs, `$` for Funds, names in ticker/tooltips): UI_SPEC §4. In-fiction wording stays as written: the player pitches investors and closes **funding rounds** to raise **funds** — the verb and the unit are deliberately different words.
