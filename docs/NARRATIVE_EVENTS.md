# NARRATIVE_EVENTS.md — Aurora Program — Complete v1 game text (English)
*All game text lives here, referenced by ID. Claude Code writes no new narrative: missing beats get added here first. Tone: skeptical press slowly turning believer; dry-humored internal memos.*

**v3.6 changes:** U-10..U-16 added (§6) for the Sprint 8 economy-unlock's new Campus/Production internal upgrades; Aluminum alloys' §8 description updated for its new real effect (ECONOMY §5 v3.6).

**v3.5 changes:** research node descriptions (§8), UI feedback toasts (§9), and manual verb copy (§10) added — closing real content gaps (Sounding rockets, Auto-refuel, VAB queues, Rush Order all previously had no player-facing text). Sections renumbered sequentially.

**v2.1 changes:** doc-ID references removed from player-facing text (N-08c, N-15); E-04 effect restated as pool + modifier (no tracked individuals); T-07 (payroll unpaid) and T-08 (propellant capacity) tooltips added.

## 1. Mission Log — scripted beats (by trigger)
| ID | Trigger | Text |
|---|---|---|
| N-01 | First manual pitch | *"You pitched your idea at a bar. Someone covered the tab out of pity. That counts as investment."* |
| N-02 | First hire | *"A technician quit a stable job to join you. His family is worried. He is not."* |
| N-03 | Finance lv1 | *"Someone now chases investors on your behalf. The word 'salary' appears for the first time."* |
| N-04 | Complex B unlocked | *"You leased a warehouse on the edge of town. The landlord asked twice if the rocket thing was serious."* |
| N-05 | First Hardware fabricated | *"The first part came off the line. It's small, it shines, and it cost more than the budget admits."* |
| N-06 | Test Stand built | *"Local paper: 'Who are these lunatics claiming they'll reach space?'"* |
| N-07 | **First static fire failure** | *"The engine blew at four seconds. The team spent the night in the debris, taking notes. Nobody mentioned quitting."* |
| N-08 | Certification success | *"Full burn. Sixty seconds of stable fire. Someone can be heard crying on the video. Nobody confesses."* |
| N-08b | First S-1 sonda flight | *"Your first rocket flew. It carried a university's experiment and the hopes of everyone on payroll. The lab already wants a second flight."* |
| N-08c | S-2 past the Kármán line | *"One hundred kilometers. For eleven seconds, something you built was in space. The bar where you made your first pitch named a drink after you."* |
| N-09 | Aurora I integrated | *"The rocket stands whole for the first time. Smaller than people imagine. Bigger than the dream used to be."* |
| N-10 | Countdown (mission 1) | *"Ten. Nine. Eight. The press showed up 'in case it explodes.' Seven. Six…"* |
| N-11 | **First successful launch** | *"AURORA I IS FLYING. The paper that mocked you wants an exclusive. The skeptical investor called three times."* |
| N-12 | Launch failure (if it happens) | *"It didn't make it. But the telemetry came back whole — and that, says your chief engineer, is worth more than the rocket."* |
| N-13 | Payload Processing built | *"The phone rings: people want to pay to put things on YOUR rockets. The plural was intentional."* |
| N-14 | First contract fulfilled | *"First satisfied customer. The check has every zero they promised. Finance framed it."* |
| N-15 | Orbital flight tech | *"Orbit. The word that sounded like science fiction back at that bar is now a line item in the quarterly plan."* |
| N-16 | **Orbital launch (v1 finale)** | *"Aurora II completed its third pass around Earth. In the control room: silence. Then the roar. Next stop: sending people."* |
| N-17 | Launch Pad B built | *"A second pad. The field where the inspector once frowned at your Refinery now has two towers against the sky. The program is no longer a bet — it's a place."* |

## 2. FTUE tooltips (shown once, dismissible)
| ID | Moment | Text |
|---|---|---|
| T-01 | Start | "Pitch your idea to raise your first funding." |
| T-02 | 50 Funding | "You can afford your first technician now." |
| T-03 | First hire | "Assign them to Finance — they'll raise funds even while you're away." |
| T-04 | First timer | "Processes keep running even when the game is closed." |
| T-05 | Cap reached | "Storage is full. Expanding the Warehouse prevents wasted production." |
| T-06 | Launch checklist | "Every green item brings you closer to liftoff. Confidence shows your odds of success." |
| T-07 | First payroll shortfall (payrollUnpaid becomes true) | "Payroll is unpaid — staffed buildings are on hold. Raise Funding (pitch!) and work resumes." |
| T-08 | VAB build starts | "Aurora I will need 400 Propellant on board. Your Depot holds 250 per level — plan the expansion." |
| T-09 | R&D Lab built with zero Scientists available | "The Lab needs a Scientist. Build Crew Quarters, add the Classroom, and promote your way up: Technician → Engineer → Scientist." |

## 3. Random events (v1 pool — 15% check per 10 active min, ≥30 min apart, never during countdown)
| ID | Event | Option A | Option B |
|---|---|---|---|
| E-01 | **Surprise inspection** — "A municipal inspector showed up unannounced. He eyes the Refinery with suspicion." *(precondition: Refinery built)* | Pay the 'preventive' fine (−5% current Funding) | Halt Production 20 min for the guided tour |
| E-02 | **Investor offer** — "A fund offers quick capital in exchange for being named 'strategic partner' in the press." | +1,000 Funding, −10 Reputation | Decline gracefully (+3 Reputation) |
| E-03 | **Defect found** — "A technician found a micro-fracture in a Hardware batch." (only if ≥15 H) | Scrap the batch (−15 Hardware) | Use it anyway (−10 Confidence next launch) |
| E-04 | **Star scientist** — "A renowned scientist wants in. So do her salary expectations." *(precondition: the player already has ≥1 Scientist — this event ACCELERATES a solved bootstrap, it must never SKIP it)* | Hire (+1 Scientist to the pool at no hiring cost; permanent modifier `salary.flat +0.60 F/s` — her premium; implemented via core/modifiers.ts, never as a tracked individual) | Let her go |
| E-05 | **Documentary crew** — "A production company wants to film the program. 'We'll barely be in the way,' they promise." | Accept (+15 Reputation, processes +10% duration for 2 h — a TEMPORARY modifier with `expiresAt`, per CLAUDE.md) | Decline |
| E-06 | **Scrapyard deal** — "A factory closed down and offers its materials 'at a friendly price.'" | Buy (300 Materials for 200 Funding) | Pass |

Rules: events wait as a pending card (never block play); **every event declares a precondition explicitly — an absent precondition is a spec error, not "no gate"** (E-01: Refinery built; E-03: ≥15 Hardware; E-04: ≥1 Scientist; E-02/E-05/E-06: Complex B built, the baseline gate so no event fires during the opening minutes); event rewards that grant resources are one-time payments and ignore caps (GDD §1c).

## 4. Contract clients & flavor
Tier 0 (sounding payloads): Coastal State University · Ionosphere Research Group · MicroGravity Labs · HamSat Collective
Tier 1 (single satellites): TerraWatch Inc. (observation) · TelCom Global (comms) · National Space Agency (science)
Tier 2 (internet constellations): **LinkSphere** · **OrbitNet** — recurring clients whose constellation batches keep coming back
Offer format: "[Client] needs [payload] in orbit by [deadline]. Pays [amount]."
Payload flavor: "a batch of internet satellites", "a comms repeater", "a biology experiment", "an Earth-observation camera", "a telescope the size of a fridge".

## 5. Program Records board labels
First ignition · First flight · Past the Kármán line · First orbit · First customer · First delivery

## 6. Building upgrade descriptions (player-facing — every purchasable states its effect BEFORE purchase)
Rule: no upgrade, building or hire may be offered without plain-language copy saying what it does. Values live in ECONOMY §4; this is the wording the player reads.

| ID | Upgrade (building) | Description shown on the buy button/tooltip |
|---|---|---|
| U-01 | Classroom (Crew Quarters) | "Train your people to change roles: Technician → Engineer → Scientist. Required before any promotion — and the only path to your first Scientist." |
| U-02 | Cafeteria (Crew Quarters) | "A proper canteen. Effective salaries drop 10% across the whole program." |
| U-03 | Extended Rail (Launch Rail) | "A longer rail for bigger sounding rockets. Required to fly the S-2 — the vehicle that can cross into space." |
| U-04 | Instrumentation (Engine Test Stand) | "Better sensors on the stand. Engine certifications finish 25% faster." |
| U-05 | Service Tower (Launch Pad) | "A fixed tower for final checks at the pad. +5 Launch Confidence on every launch from this pad." |
| U-06 | Flame Trench (Launch Pad) | "Channels the exhaust away from the pad. Pad turnaround after a launch is 30% shorter." |
| U-07 | Antenna Network (Tracking Station) | "More ground antennas, more telemetry recovered. +25% Flight Experience from every flight." |
| U-08 | Weather Station (Tracking Station) | "Your own forecasting. Launch weather windows open every 2 minutes instead of 2–5." |
| U-09 | Clean Room (VAB) | "A contamination-controlled bay. Required to accept constellation-batch contracts — the program's most lucrative clients." |
| U-10 | Grants desk (Finance) | "A dedicated desk chasing grant money. +1 Technician slot at Finance." |
| U-11 | Technical archive (R&D Lab) | "Organized records of every experiment run here. +1 Scientist slot at the R&D Lab." |
| U-12 | Second research track (R&D Lab) | "A second bench, a second project. Run two research nodes at once instead of queueing them." |
| U-13 | Bulk contracts (Supply Depot) | "Standing orders with your material suppliers. +1 Technician slot at Supply Depot." |
| U-14 | Recovery loop (Refinery) | "Reclaims runoff from the refining process. Materials consumed per Propellant drop 10%." |
| U-15 | QA station (Fabrication) | "Catches bad stock before it's machined. Materials consumed per Hardware drop 15%." |
| U-16 | Inventory system (Warehouse) | "Denser shelving, better tracking. Every future Warehouse level stores 25% more." |

Rules: **v2-only upgrades (Sound Suppression, Cryogenic Stand, Heavy Crane) are NOT rendered in v1 at all** — not greyed, not teased. Every building tile likewise states what it produces or enables in plain language, never only a number.

## 7. Staff & slot copy (the idle-staff trap)
| ID | Moment | Text |
|---|---|---|
| T-10 | Hiring panel, always visible | "Open slots across the program: [N]" |
| T-11 | About to hire with 0 open slots | "No open slots — this hire will sit idle and still draw salary. Idle staff can still be promoted (Technician → Engineer → Scientist)." |
| T-12 | A building shows full slots (e.g. 2/2) | "Fully staffed. To produce more here, raise the building's level — slots are fixed per building." |
## 8. Research node descriptions (player-facing — every node states its effect, including zero-effect gates)
| Branch | Node | Description |
|---|---|---|
| Materials | Aluminum alloys | "Certifying aluminum stock for flight hardware. Fabrication wastes 10% less Material per Hardware — and unlocks Titanium research." |
| Materials | Titanium | "Unlocks Titanium-tier Hardware. Fabrication starts producing at this tier automatically — no switch to flip." |
| Propulsion | Sounding rockets | "Groundwork for suborbital flight. No other effect — unlocks Probe-1 engine certification at the Test Stand." |
| Propulsion | Probe-1 engine | "Certify the engine that powers your S-1 and S-2 sounding rockets." |
| Propulsion | Orbital-1 engine | "Certify the engine that powers Aurora I — your first satellite." |
| Operations | Basic logistics | "Streamlined ground handling. −25% pad transfer time." |
| Operations | Remote Ops | "Remote monitoring while you're away. Offline cap: 10h → 16h." |
| Operations | VAB queues | "Stages integrate automatically once the previous one finishes — no manual click between them." |
| Operations | Auto-refuel | "Automated propellant handling for satellite-class missions. −50% propellant loading time." |
| Program | Basic engineering | "Unlocks hiring Engineers directly (promotion remains available and, at higher headcounts, cheaper — see the staff panel)." |
| Program | Scientific method | "Unlocks hiring Scientists directly." |
| Program | Test stand | "Unlocks the Testing complex." |
| Program | Flight operations | "Unlocks hiring Controllers directly." |
| Program | Flight program | "Unlocks the Launch complex." |
| Program | Orbital flight | "Unlocks Aurora II and the orbital mission class." |

## 9. UI feedback text (toasts, confirmations — not narrative beats)
| ID | Moment | Text |
|---|---|---|
| T-14 | First tick of a new Hardware tier | "Fabrication now produces Titanium-tier Hardware." (one-time toast, not a Mission Log entry) |
| T-15 | Releasing a staff member (inline confirm) | "Release this [role]? No refund of hiring cost. Confirm?" |
| T-16 | First entry into the Testing complex | "The Test Stand certifies engines before they fly — every engine, every time. Certifications run as timed processes; track them in the strip above." |
| T-17 | First entry into the Launch complex | "This is where rockets fly. Build the VAB, integrate a rocket, and complete the launch checklist — every item, every time — to unlock the countdown." |

## 10. Manual verb descriptions (missing from earlier docs — same "no purchasable without effect text" rule)
| Verb | Description |
|---|---|
| Rush Order | "Trade Funding for instant Materials when you need them now instead of waiting on the Depot." |
