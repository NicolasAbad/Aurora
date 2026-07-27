// CLAUDE.md rule 9: game text only from NARRATIVE_EVENTS.md, referenced by ID. This is
// that lookup — the single place UI components resolve an ID to its player-facing text,
// so nothing ever hardcodes a narrative string inline. Populated so far: U-* (upgrade
// copy, §6) and T-10/T-11/T-12 (idle-staff copy, §7). N-* (Mission Log beats) and the
// T-01..T-09 FTUE tooltips are added when their own consumers land (Sprint 5's Mission
// Log, Sprint 8's tooltip system) — same "infra as its content is verified" restraint
// used throughout this project, not a placeholder table of invented text.
export const NARRATIVE_TEXT: Record<string, string> = {
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
  // §7 — staff & slot copy (the idle-staff trap)
  'T-10': 'Open slots across the program: {n}',
  'T-11':
    'No open slots — this hire will sit idle and still draw salary. Idle staff can still be promoted (Technician → Engineer → Scientist).',
  'T-12': 'Fully staffed. To produce more here, raise the building’s level — slots are fixed per building.',
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
