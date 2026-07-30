// SPRINTS.md Sprint 10.5, item 5 (cheap win): Mission Log category icon badges
// (rocket/flask/people/building/document/star) for scannability. The feed
// (data/narrative.ts's missionLogBase) stores already-RENDERED English text, not
// narrative IDs (T-18/19/20/23/26's generic-completion lines and whichever N-* beats
// `narrative.seen` has picked up) — this is therefore a best-effort keyword heuristic
// over that rendered text, not an ID-based lookup (rule 9's "referenced by ID" governs
// what text IS shown, not this presentation-only grouping of what's already been
// resolved). The five completion templates (T-18/19/20/23/26) match their fixed
// prefixes exactly; N-* flavor prose is looser and falls back to 'rocket' — the
// program's general "something happened with a rocket" bucket — when nothing more
// specific matches.
export type MissionLogCategory = 'rocket' | 'flask' | 'people' | 'building' | 'document' | 'star';

export function categorizeLogLine(text: string): MissionLogCategory {
  // T-18/T-19/T-20/T-23/T-26 — the generic, template-driven completions.
  if (text.startsWith('Promotion complete')) return 'people';
  if (text.startsWith('Research complete')) return 'flask';
  if (text.startsWith('Flight Experience:')) return 'rocket';
  if (text.startsWith('Upgrade complete') || / expanded! \+1 /.test(text)) return 'building';

  // N-* flavor beats — keyword heuristic over the fixed English copy.
  if (/technician|engineer|scientist|controller|salary|staff/i.test(text)) return 'people';
  if (/customer|check has every zero|phone rings|local paper/i.test(text)) return 'document';
  if (/warehouse|second pad|came off the line/i.test(text)) return 'building';
  if (/kilometers|is flying|\borbit\b|pass around earth/i.test(text)) return 'star';

  return 'rocket';
}
