# NARRATIVE_EVENTS.md — Aurora Program — Complete v1 game text (English)
*All game text lives here, referenced by ID. Claude Code writes no new narrative: missing beats get added here first. Tone: skeptical press slowly turning believer; dry-humored internal memos.*

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
