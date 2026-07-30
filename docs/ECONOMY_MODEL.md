# ECONOMY_MODEL.md — Aurora Program — Complete baseline numbers
*Every value in the game. Claude Code does NOT invent numbers: if a value isn't here, ask and add it here first. Tick = 1 second (logical economy rate; the render loop is delta-based per CLAUDE.md rule 6). Baseline for the Sprint-0 headless simulator (`sim/run.ts`); adjust only via the simulator, updating this file.*

**v4.1 changes (Sprint 11.5 — economy friction & progression pass, owner manual-play findings post-Sprint-11):** Engineer/Scientist made promotion-only (structural, not a value patch — GDD §2 v2.11); `basicEngineering`/`scientificMethod` repurposed as promotion accelerators. New §3b (resource friction principles) and §5b (research tree gating + mixed costs) added — DIRECTIONS for Sprint 11.5's design work, not final numbers; see SPRINTS Sprint 11.5 for the full task list. Real bug flagged: displayed Funding rate must net out salary burn (§3c) — was showing gross production, not what the player actually receives.

**v4.0 changes (Sprint 10 wrap-up):** satellite-era Flight Data share flagged at 81-85% vs the 20-35% target once Aurora II's repeatable, non-decaying reward is live — target predates Aurora II; framed for Sprint 11's balance pass as "redefine the metric vs. fix the economy," not assumed broken. See SPRINTS Sprint 11 for the full framing.

**v3.9 changes (Sprint 10 design questions):** §7 restructured — Aurora II confirmed to reuse Aurora I's mechanics wholesale, no separate values; `orbitalFlight` tech gates the SECOND orbital attempt onward, NOT Aurora I's own launch (the doc's old wording was simply wrong — shipped, tested Sprint 7 behavior is authoritative); "Parallel integration" XP node clarified as auto-chaining stages with no dead time between them, not literal concurrent timers (VAB stages keep real prerequisite order).

**v3.8 changes (owner design proposal — emotional payoff for staff growth):** new building-expansion milestone rule (§4c) — every 10 levels, a slotted building gains +1 slot per role it already employs, universal and automatic, coexisting with the already-shipped specific slot upgrades. **SCOPED UNLOCK — full sim sweep required.**

**v3.7 changes (Sprint 9.5 — second manual-play pass):** rate-display precision fixed (§12 — deltas below 0.1 now show 2 decimals, closing the "+0.0/s" R&D Lab bug); Basic engineering's cost raised 15R/3min → 120R/45min to protect the promotion-bootstrap pacing (SCOPED UNLOCK, re-run sim). Hiring-cost curve (base cost / 1.15^hiredOfThatRole factor) flagged by the owner as possibly too shallow given realistic headcounts — NOT changed here; parked as a dedicated balance-pass candidate before the itch.io build (BACKLOG).

**Version history (compressed — full detail only for the latest 2 versions above; older entries kept as one-liners for traceability, not routine reading):**
- v3.6: satellite contract build process specified (§10) — single-stage integration, scaled duration, free flight review.
- v3.5: Auto-refuel and Test Stand leveling given real effects (both were undefined gaps); Sounding rockets confirmed a pure gate; Hardware tier production confirmed automatic (UI feedback was the actual gap).
- v3.4: Sprint 6 ratifications — Propellant is a live launch-time check, not timed; full failure package applies to all launches not just Aurora I; Records gate on success except "First ignition."
- v3.2: Radar confirmed non-purchasable (base Tracking Station); [v2] upgrades hidden; upgrade copy made mandatory.
- v3.1: tier-0 Confidence uses the sonda formula; "Clean Room" naming collision resolved; Reputation gates added to satellite tiers; contract fail-vs-deadline penalty disambiguated.
- v3.0: player-facing display names & cost rendering defined (§12) — presentation only.
- v2.9: Aluminum node disambiguated — no production effect, gate-only.
- v2.8: multi-role staffRatio = bottleneck rule; slots require level ≥ 1; no single-letter abbreviations; dev reset button.
- v2.7: tick resolution order + starvation/contention rules defined (§4b).
- v2.5: Flight Data raised ~1.7×; salary band widened to 30-55%; day-1 stall accepted as intended pacing.
- v2.4: contract rewards specified per tier.
- v2.3: R&D Lab rate cut to 0.03/level with Flight Data compensated; day-5 pacing floor codified.
- v2.2: pitch yield unified; starting staff cap documented; number formatting = 3 sig figs.
- v2.1: initial sim-driven rebalance (salaries, R&D Lab rate, sonda Confidence base, failure XP, Remote Ops node).

## 1. Starting state
Funding 0 · Materials 0 · Research 0 · Hardware 0 (Aluminum tier) · Propellant 0 · Reputation 0 · Flight XP 0. Buildings: Offices lv1 (free, pre-built). Staff: 0. **Starting staff cap: 2** (before any Crew Quarters; Quarters adds +3 per level). Initial caps (no Warehouse): Funding 500 *(owner-reported feeling too tight, candidate to raise to 1,000 — Sprint 11.5, sim-verify before changing)* · Materials 200 · Hardware 50 · Propellant 0 (requires Propellant Depot).

## 2. Manual actions (evolving verbs)
| Action | Yield | Cooldown | Unlock / evolution |
|---|---|---|---|
| Pitch investors | `10 + 5 × (Offices level − 1)` Funding (lv1 = 10, lv2 = 15, lv3 = 20…) — the ONLY pitch formula; §4's Offices row is a reference to this | 1 s | Start |
| Funding Round I | 500 Funding | 10 min | Reputation ≥ 25 (replaces nothing; pitch stays) |
| Funding Round II | 2,500 Funding | 30 min | Reputation ≥ 75 |
| Gather materials | 5 Materials | 1 s | Supply Depot lv1 |
| Rush Order | 100 Materials for 150 Funding | 5 min | Fabrication built *(intentional: the verb evolves when Materials become a real bottleneck — i.e. when something consumes them — not when the Depot is built)* |

Funding Round payouts are one-time payments: they **ignore the Funding cap** (GDD §1c).

## 3. Staff — hiring cost `base × 1.15^hiredOfThatRole` (exponent per role, Technician/Controller only), salary per second per unit
| Role | Base cost | Salary/s | Unlock |
|---|---|---|---|
| Technician | 50 | 0.15 | Start |
| Engineer | — (promotion only) | 0.35 | Classroom built |
| Scientist | — (promotion only) | 0.60 | Classroom built + ≥1 Engineer to promote |
| Controller | 250 | 0.35 | Tech: Flight operations |

Promotions (Quarters "Classroom"): Tech→Engineer 100 F + 15 min · Engineer→Scientist 300 F + 45 min. **Engineer and Scientist are promotion-ONLY (GDD §2 v2.11) — there is no hiring-cost row for them because there is no direct-hire path.** `basicEngineering`/`scientificMethod` techs (formerly hiring unlocks) are repurposed as promotion accelerators — see §5.
**Bootstrap rule (now structural, not just intended):** Technician is the sole entry point; Engineer/Scientist can ONLY be reached via the Classroom. This was previously enforced by keeping hiring-unlock techs expensive (a value patch); it is now enforced by the schema having no hiring path at all — do not add one back.
Sanity rule: total salaries = 30–55% of passive Funding income at 5 checkpoints of the arc — **verified by `sim/run.ts` at each checkpoint, not by hand**.
Insolvency behavior (Funding 0, salaries due): GDD §1b — staffed production pauses, no debt, no quitting, manual verbs remain. Applies identically offline.

## 3b. Resource friction (Sprint 11.5 design goal — direction, not final numbers)
Real player finding: the economy currently never forces a genuine "do I hire this person even though it strains my supply chain" decision — staffing and resource generation feel decoupled/linear rather than in tension. Design goal for Sprint 11.5: **at least one real moment in the arc where adding staff (to Fabrication/Refinery in particular) meaningfully competes with the Materials/Propellant those same hires would consume**, so staffing is sometimes a genuine trade-off, not a strictly-positive action. Candidate levers (propose exact numbers via the established process — propose against precedent, sim-verify, report): raise per-unit consumption rates in Fabrication/Refinery relative to Supply Depot's output; make some upgrade costs draw from the SAME resources a build order needs elsewhere (see §5b, §4d); widen the gap between "just enough" and "comfortable" staffing so idle capacity isn't free. This directly feeds finding that Gather Materials/Rush Order (ECONOMY §2) currently see no use — real scarcity moments make them relevant again; the fix is NOT to remove those verbs.

## 3c. Real bug: displayed rate must be NET of salary burn
The ticker/production-rate display currently shows GROSS production (e.g. "+20/s Funding") without netting the salary burn it's already paying (e.g. "-1/s") — the player sees +20 but experiences +19. **Fix: every displayed net rate subtracts its own salary burn before rendering.** Presentation-only, no value change, fix immediately (not gated on the rest of Sprint 11.5).

## 3d. Contradiction to resolve: Sprint 11's "hiring cost is a non-issue" vs. real play
Sprint 11's dedicated balance pass concluded the hiring-cost curve was fine, unchanged. The owner's own subsequent manual play directly contradicts that: aggressively leveling Finance early (reaching ~40 Funding/s) made a 200-cost hire and a 100-cost promotion feel trivial — 5 and 2.5 seconds of income respectively. **This is likely a sim-bot-vs-real-player divergence, not a wrong prior conclusion** — a bot policy that spreads investment evenly may never reproduce the "dump everything into one high-yield building early" pattern a real optimizing player finds naturally. Sprint 11.5 must specifically test an aggressive-single-building-investment policy in the sim (not just the existing optimal/human/casual profiles) before deciding whether to raise the hiring-cost curve — real human-reported experience outranks a prior simulated conclusion when they conflict, but confirm with data before changing values.

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
| Fabrication | 350 F + 100 M | 1.15 | +0.3 Hardware/s per level. **Consumes 2 Materials per Hardware produced** (UI must show this as its own line, not folded into the output line). Produces at current researched tier automatically. | 1 Eng + 1 Tech |
| Refinery | 300 F + 80 M | 1.14 | +0.5 Propellant/s per level. **Consumes 1 Material per Propellant produced** (its own visible line, same rule as Fabrication). | 1 Eng |
| Warehouse | 250 F + 50 M | 1.07 | +500 F / +300 M / +75 H cap per level | — |
| Propellant Depot | 400 F + 120 M | 1.07 | +250 Propellant cap per level | — |

### Complex C — Testing (unlock: tech "Test stand")
| Building | Base cost | Factor | Effect | Slots |
|---|---|---|---|---|
| Engine Test Stand | 800 F + 300 M + 40 H | 1.20 | Enables certifications (§6) + sonda assembly workshop. **Each level beyond 1: −3% certification duration**, stacking multiplicatively with the Instrumentation upgrade (previously undefined — leveling had no effect at all, a real gap). | 2 Eng + 1 Tech |
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

## 4c. Building expansion — level milestones (new, replaces "buy a slot upgrade" as the ONLY lever)
**Every building with staff slots gains +1 slot in EACH role it already employs, every 10 levels (10, 20, 30…).** This is a universal, automatic rule — not an upgrade, not a purchase, just a milestone the player earns by leveling. It coexists with the specific slot-adding upgrades already shipped (Grants desk/Finance, Technical archive/R&D Lab, Bulk contracts/Supply Depot): those remain the early, targeted lever for a player who wants a slot sooner than level 10; the milestone is the universal long-term one every slotted building eventually gets, whether or not it has a dedicated upgrade.

Rationale for 10 (not 25): `costFactor` is exponential (1.14–1.25 depending on building) — at a 25-level threshold, high-factor buildings (VAB at 1.25) would take enormously longer to reach than low-factor ones (Warehouse at 1.07), making the milestone feel unreachable for some buildings and trivial for others. 10 keeps it a real, earned event across the whole roster without becoming "never."

Milestone fires a one-time celebration (NARRATIVE §9, new entry) distinct from the routine upgrade-purchase toast — this is meant to read as a bigger, rarer moment, reusing the Mission Log's unread-badge mechanism (UI_SPEC §2f).

**SCOPED UNLOCK — new headcount capacity at fixed levels changes salary trajectory; requires the full sim sweep** (all three profiles) after implementation. If any building's level-10 milestone lands earlier than expected in clean play and pushes the salary ratio meaningfully outside 30–55%, report the specific building/level — don't retune the milestone cadence yourself.

## 4d. Multi-resource costs at higher levels (Sprint 11.5 design goal — direction, not final numbers)
Real finding: building upgrade costs stay single/dual-resource forever, never diversifying at higher levels — this understates a mature facility's real logistics (a level-50 Finance office needs more than just Funding to expand). Design goal: **past certain level thresholds, an upgrade's cost gains additional resource types** — e.g. a building might cost Funding-only through level ~20, add Materials from ~20-50, add Hardware past ~50, with exact thresholds and mixes varying per building (a Refinery's late costs might lean Materials-heavy, a Test Stand's might lean Hardware-heavy). This directly creates the late-game resource competition §3b asks for — a Finance upgrade competing with Fabrication for the same Materials is a real trade-off. Exact thresholds/mixes per building go through the propose-then-ratify process with a full sim sweep.

## 5. Research tree v1 (cost in Research, real-time duration)
Materials: **Aluminum alloys** (25 R, 5 min — *branch entry node: no production effect in v1; the Aluminum Hardware tier is available from the start with NO tech required. Its function is to gate Titanium and to be an early, affordable teaching node. Flavor: certifying aluminum stock for flight hardware*) → Titanium (400 R, 3 h)
Propulsion: **Sounding rockets (20 R, 4 min — gate-only: unlocks Probe-1 engine certification at the Test Stand, no other effect, same honest-zero-effect pattern as Aluminum alloys)** → Probe-1 engine (40 R, 10 min) → Orbital-1 engine (500 R, 4 h)
Operations: Basic logistics (60 R, 15 min: −25% pad transfer time) → **Remote Ops (120 R, 45 min: offline cap 10 h → 16 h)** → VAB queues (350 R, 2 h: auto-queue stages) → Auto-refuel (600 R, 5 h: **−50% propellant loading duration for satellite-class missions** — previously undefined, a real gap; sonda Propellant is a live check, not timed, per v3.4, so this node's effect is Aurora-I-and-beyond specific)
Program: **Basic engineering (120 R, 45 min — REPURPOSED (v4.1): Engineer/Scientist hiring no longer exists to unlock (GDD §2 v2.11); this node now grants −25% Tech→Engineer promotion time/cost instead. Cost/duration provisional pending Sprint 11.5's sim verification.)** → **Scientific method (80 R, 20 min — REPURPOSED: −25% Engineer→Scientist promotion time/cost, same reasoning)** → Test stand (150 R, 40 min) → Flight operations (250 R, 1 h) → Flight program (400 R, 2 h) → Orbital flight (700 R, 6 h)

## 5b. Research tree gating & mixed costs (Sprint 11.5 design goal)
Two real findings: (1) some Propulsion-branch nodes are researchable before the Testing complex (Engine Test Stand) even exists — thematically odd (why certify an engine-testing procedure for a facility you don't have) and mechanically frictionless. (2) All research nodes cost pure Research points; none draw on Funding/Materials, understating that R&D has real costs beyond brainpower. Design goals for Sprint 11.5: **some nodes gain a building prerequisite, not just a tech prerequisite** (Probe-1 engine research is the clear first candidate — require Engine Test Stand built, not just Sounding rockets researched); **some nodes gain a secondary cost** (Funding and/or Materials alongside Research) — not all of them, reserve it for nodes where "this costs real money too" makes sense (certification-adjacent and building-unlocking nodes are good candidates; pure knowledge nodes like Aluminum alloys can stay Research-only). Also: **Research income needs rebalancing relative to node costs** — real playtesting found 3 Scientists generate more Research than the entire remaining tree needs while waiting on a single >1h node, meaning Research stopped being a real constraint. Exact node-by-node assignment and the Research-income adjustment go through the propose-then-ratify process with a full sim sweep, same discipline as every other SCOPED UNLOCK.

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

## 7. Aurora I & Aurora II (orbital missions — v1 climax) — VAB integration
Structure 30 H, 20 min → Engines (Orbital-1 certified) 20 H, 15 min → Guidance 15 H + 30 R, 15 min → Satellite payload 15 H, **15 min** (Payload Processing not required for own satellite) → Final integration 10 H, 10 min → Pad transfer 5 min → Propellant load 400 P, 3 min → Flight review 50 R, **instant** (pure Research spend, no timer — this applies to all flight reviews, S-2's included). Requires: Flight program tech + Tracking Station active + full checklist (GDD §7). **Note: the 400 P load requires Propellant Depot lv2 (cap 500) — surfaced to the player via tooltip T-08 when the VAB build starts.**

**Aurora II reuses these mechanics wholesale — same stages, costs, durations, checklist, and reward values.** No separate cost/reward table: this IS the Aurora II section. `missionType` tags the first-ever successful orbital launch `'auroraI'`; every one after is `'auroraII'`. **`orbitalFlight` tech gates the SECOND orbital attempt onward (Aurora II), not Aurora I's own launch** — Aurora I has been playable and tested since Sprint 7 gated only on Flight program tech + VAB, and that shipped behavior is authoritative over this doc's earlier wording, which was simply wrong. `orbitalFlight`'s narrative beat (N-15) already describes it as unlocking "Aurora II and the orbital mission class" — this is that unlock made mechanical, not just narrative.

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
Operations: Procedures (100: integration −10%) → Turnaround (300: pad ready −30%) → **Parallel integration (700: auto-chains VAB stages — the next stage's timer starts the instant the previous one finishes, no manual click between them. Not literal concurrent timers: stages keep their real prerequisite order (Structure→Engines→Guidance→Payload→Final) since each genuinely depends on the last; "parallel" describes removing dead time between them, not simultaneous construction — mechanic change)**
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

**Satellite contract build process (previously undefined — real gap, now specified):** the "Requires" row is a lump total, not a stage table like Aurora I's (§7). Contracts get a SINGLE "Payload integration" stage at the VAB — not Aurora I's 5-stage breakdown, which is that mission's own narrative weight and not warranted for routine repeat business. Duration scales to Aurora I's own established Hardware-per-minute build density (90 H / 75 min ≈ 1.2 H/min): **tier 1 ≈ 33 min, tier 2 ≈ 67 min.** After integration, the contract's rocket reuses the pad's existing `padTransfer` (5 min) and `propellantLoad` steps exactly as Aurora I does, at its own H/P totals. **Flight review is free (0 Research)** — §10 never listed a Research cost for it, and charging one now would open an undocumented Research sink against an economy whose Flight-Data share is already tuned to a 20–35% band; a routine contract satellite doesn't warrant the same review weight as the flagship mission.

## 11. Offline, events, weather
Offline: 60% of active rates **including salaries**, 10 h cap (16 h with Remote Ops); process timers run at 100%; insolvency resolved with the same rule as online (GDD §1b) and reported in the summary. **No paid skips in v1.**
Random events: 15% check every 10 active min; ≥30 min between events; pool in NARRATIVE_EVENTS §3.
Weather window: uniform 2–5 min (fixed 2 min with Weather Station); a pending window at close resolves by timestamp on reopen.

## 12. Number formatting & player-facing names
Suffixes from 10,000, always **3 significant figures**: 10.0K, 125K, 1.25M, 3.10B. Rates 1 decimal — **except any rate/delta whose magnitude is below 0.1, which renders with 2 decimals instead** (a real bug: R&D Lab's 0.03 Research/s per level rounded to "+0.0/s" and read as broken; fix applies to every rate display, not just that one case). Percentages integers.

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
