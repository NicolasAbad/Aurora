// CLAUDE.md rule 9: game text only from NARRATIVE_EVENTS.md, referenced by ID. This is
// that lookup — the single place UI components resolve an ID to its player-facing text,
// so nothing ever hardcodes a narrative string inline. N-* text (§1, Mission Log beats)
// is transcribed here in full now that Sprint 5 builds the Mission Log — but only
// N-01..N-08 have a real TRIGGER wired anywhere in the code yet (see markSeen call
// sites); N-09 onward sit ready, unwired, for whichever sprint builds VAB/Aurora I/
// contracts/Pad B. T-01..T-09 FTUE tooltips are wired in Sprint 8 (core/ftue.ts + App.tsx).
export const NARRATIVE_TEXT: Record<string, string> = {
  // §1 — Mission Log scripted beats (by trigger)
  'N-01': 'You pitched your idea at a bar. Someone covered the tab out of pity. That counts as investment.',
  'N-02': 'A technician quit a stable job to join you. His family is worried. He is not.',
  'N-03': 'Someone now chases investors on your behalf. The word ‘salary’ appears for the first time.',
  'N-04': 'You leased a warehouse on the edge of town. The landlord asked twice if the rocket thing was serious.',
  'N-05': 'The first part came off the line. It’s small, it shines, and it cost more than the budget admits.',
  'N-06': 'Local paper: ‘Who are these lunatics claiming they’ll reach space?’',
  'N-07': 'The engine blew at four seconds. The team spent the night in the debris, taking notes. Nobody mentioned quitting.',
  'N-08': 'Full burn. Sixty seconds of stable fire. Someone can be heard crying on the video. Nobody confesses.',
  'N-08b': 'Your first rocket flew. It carried a university’s experiment and the hopes of everyone on payroll. The lab already wants a second flight.',
  'N-08c': 'One hundred kilometers. For eleven seconds, something you built was in space. The bar where you made your first pitch named a drink after you.',
  'N-09': 'The rocket stands whole for the first time. Smaller than people imagine. Bigger than the dream used to be.',
  'N-10': 'Ten. Nine. Eight. The press showed up ‘in case it explodes.’ Seven. Six…',
  'N-11': 'AURORA I IS FLYING. The paper that mocked you wants an exclusive. The skeptical investor called three times.',
  'N-12': 'It didn’t make it. But the telemetry came back whole — and that, says your chief engineer, is worth more than the rocket.',
  'N-13': 'The phone rings: people want to pay to put things on YOUR rockets. The plural was intentional.',
  'N-14': 'First satisfied customer. The check has every zero they promised. Finance framed it.',
  'N-15': 'Orbit. The word that sounded like science fiction back at that bar is now a line item in the quarterly plan.',
  'N-16': 'Aurora II completed its third pass around Earth. In the control room: silence. Then the roar. Next stop: sending people.',
  'N-17': 'A second pad. The field where the inspector once frowned at your Refinery now has two towers against the sky. The program is no longer a bet — it’s a place.',
  // §2 (v3.6) — FTUE tooltips (shown once, dismissible). Triggers wired in core/ftue.ts
  // (T-01..T-05/T-07..T-09) and LaunchPanel/App.tsx (T-06, a screen-mount moment, same
  // FirstEntryTip treatment as T-16/T-17 — see core/ftue.ts's own header note).
  'T-01': 'Pitch your idea to raise your first funding.',
  'T-02': 'You can afford your first technician now.',
  'T-03': 'Assign them to Finance — they’ll raise funds even while you’re away.',
  'T-04': 'Processes keep running even when the game is closed.',
  'T-05': 'Storage is full. Expanding the Warehouse prevents wasted production.',
  'T-06': 'Every green item brings you closer to liftoff. Confidence shows your odds of success.',
  'T-07': 'Payroll is unpaid — staffed buildings are on hold. Raise Funding (pitch!) and work resumes.',
  'T-08': 'Aurora I will need 400 Propellant on board. Your Depot holds 250 per level — plan the expansion.',
  'T-09': 'The Lab needs a Scientist. Build Crew Quarters, add the Classroom, and promote your way up: Technician → Engineer → Scientist.',
  // §6 — building upgrade descriptions (every purchasable states its effect BEFORE purchase)
  'U-01':
    'Train your people to change roles: Technician → Engineer → Scientist. Required before any promotion — and the only path to your first Scientist.',
  'U-02': 'A proper canteen. Effective salaries drop 10% across the whole program.',
  'U-03': 'A longer rail for bigger sounding rockets. Required to fly the S-2 — the vehicle that can cross into space.',
  'U-04': 'Better sensors on the stand. Engine certifications finish 25% faster.',
  'U-05': 'A fixed tower for final checks at the pad. +5 Launch Confidence on every launch from this pad.',
  'U-06': 'Channels the exhaust away from the pad. Pad turnaround after a launch is 30% shorter.',
  'U-07': 'More ground antennas, more telemetry recovered. +25% Flight Experience from every flight.',
  'U-08': 'Your own forecasting. Launch weather windows open every 2 minutes instead of 2–5.',
  'U-09': 'A contamination-controlled bay. Required to accept constellation-batch contracts — the program’s most lucrative clients.',
  // v3.6 (Sprint 8 economy unlock) — Campus/Production internal upgrades
  'U-10': 'A dedicated desk chasing grant money. +1 Technician slot at Finance.',
  'U-11': 'Organized records of every experiment run here. +1 Scientist slot at the R&D Lab.',
  'U-12': 'A second bench, a second project. Run two research nodes at once instead of queueing them.',
  'U-13': 'Standing orders with your material suppliers. +1 Technician slot at Supply Depot.',
  'U-14': 'Reclaims runoff from the refining process. Materials consumed per Propellant drop 10%.',
  'U-15': 'Catches bad stock before it’s machined. Materials consumed per Hardware drop 15%.',
  'U-16': 'Denser shelving, better tracking. Every future Warehouse level stores 25% more.',
  // §7 — staff & slot copy (the idle-staff trap)
  'T-10': 'Open slots across the program: {n}',
  'T-11':
    'No open slots — this hire will sit idle and still draw salary. Idle staff can still be promoted (Technician → Engineer → Scientist).',
  'T-12': 'Fully staffed. To produce more here, raise the building’s level — slots are fixed per building.',
  // §8 (v3.5) — research node descriptions, keyed by the node's own id (RESEARCH_TREE /
  // researchTree.ts) rather than a T-/N-/U- id: §8's table has no separate ID column,
  // and every node id is already a stable, unique key — reusing it is the natural
  // "referenced by ID" reading (rule 9) rather than inventing a parallel namespace.
  aluminum: 'Certifying aluminum stock for flight hardware. Fabrication wastes 10% less Material per Hardware — and unlocks Titanium research.',
  titanium: 'Unlocks Titanium-tier Hardware. Fabrication starts producing at this tier automatically — no switch to flip.',
  soundingRockets: 'Groundwork for suborbital flight. No other effect — unlocks Probe-1 engine certification at the Test Stand.',
  probe1Engine: 'Certify the engine that powers your S-1 and S-2 sounding rockets.',
  orbital1Engine: 'Certify the engine that powers Aurora I — your first satellite.',
  basicLogistics: 'Streamlined ground handling. -25% pad transfer time.',
  remoteOps: 'Remote monitoring while you’re away. Offline cap: 10h -> 16h.',
  vabQueues: 'Stages integrate automatically once the previous one finishes — no manual click between them.',
  autoRefuel: 'Automated propellant handling for satellite-class missions. -50% propellant loading time.',
  basicEngineering: 'Unlocks hiring Engineers directly (promotion remains available and, at higher headcounts, cheaper — see the staff panel).',
  scientificMethod: 'Unlocks hiring Scientists directly.',
  testStand: 'Unlocks the Testing complex.',
  flightOperations: 'Unlocks hiring Controllers directly.',
  flightProgram: 'Unlocks the Launch complex.',
  orbitalFlight: 'Unlocks Aurora II and the orbital mission class.',
  // §9 — UI feedback text (toasts, confirmations — not Mission Log entries; rendered
  // directly at the point of relevance, same treatment as T-10/T-11/T-12 above).
  'T-14': 'Fabrication now produces Titanium-tier Hardware.',
  'T-15': 'Release this {role}? No refund of hiring cost. Confirm?',
  'T-16': 'The Test Stand certifies engines before they fly — every engine, every time. Certifications run as timed processes; track them in the strip above.',
  'T-17': 'This is where rockets fly. Build the VAB, integrate a rocket, and complete the launch checklist — every item, every time — to unlock the countdown.',
  // §10 — manual verb descriptions (same "no purchasable without effect text" rule).
  rushOrder: 'Trade Funding for instant Materials when you need them now instead of waiting on the Depot.',
  // §3 (Sprint 9) — random events. Each event is one flavor string (title + situation)
  // plus its two option strings (data/events.ts's EventDef.optionA/B.narrativeId).
  'E-01': 'Surprise inspection: a municipal inspector showed up unannounced. He eyes the Refinery with suspicion.',
  'E-01a': "Pay the 'preventive' fine (−5% current Funding)",
  'E-01b': 'Halt production for 20 minutes for the guided tour',
  'E-02': "Investor offer: a fund offers quick capital in exchange for being named 'strategic partner' in the press.",
  'E-02a': '+1,000 Funding, −10 Reputation',
  'E-02b': 'Decline gracefully (+3 Reputation)',
  'E-03': 'Defect found: a technician found a micro-fracture in a Hardware batch.',
  'E-03a': 'Scrap the batch (−15 Hardware)',
  'E-03b': 'Use it anyway (−10 Confidence on the next launch)',
  'E-04': "Star scientist: a renowned scientist wants in. So do her salary expectations.",
  'E-04a': 'Hire (+1 Scientist to the pool at no hiring cost, but her salary premium is permanent)',
  'E-04b': 'Let her go',
  'E-05': "Documentary crew: a production company wants to film the program. 'We'll barely be in the way,' they promise.",
  'E-05a': '+15 Reputation, but every process runs 10% longer for the next 2 hours',
  'E-05b': 'Decline',
  'E-06': "Scrapyard deal: a factory closed down and offers its materials 'at a friendly price.'",
  'E-06a': 'Buy (300 Materials for 200 Funding)',
  'E-06b': 'Pass',
};

/** Resolves an ID to its text, filling any `{name}` placeholders (T-10's open-slot
 * count is the only one so far). Returns '' for an unknown id rather than throwing —
 * a missing id is a content gap to notice in review, not a reason to crash the UI. */
export function narrativeText(id: string, vars?: Record<string, string | number>): string {
  const template = NARRATIVE_TEXT[id];
  if (!template) return '';
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

/** GDD §10: Mission Log beats are one-time milestones, not repeatable events — idempotent
 * append, mirrors registerModifier's same-shape idempotency in core/modifiers.ts. */
export function markSeen(seen: string[], id: string): string[] {
  return seen.includes(id) ? seen : [...seen, id];
}
