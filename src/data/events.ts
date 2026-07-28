// NARRATIVE_EVENTS.md §3 (v1 pool). Text lives in data/narrative.ts (rule 9 — referenced
// by ID, E-01/E-01a/E-01b etc.); this file is the mechanical definition: precondition +
// what each option actually does. "Every event declares a precondition explicitly — an
// absent precondition is a spec error, not 'no gate'" (§3's own rule) — the four
// preconditions below cover every event; E-02/E-05/E-06 share the "Complex B built"
// baseline gate the doc names explicitly.
export type EventPreconditionId =
  | 'refineryBuilt' // E-01
  | 'complexBBuilt' // E-02, E-05, E-06 (baseline gate — no event fires during the opening minutes)
  | 'hardware15Plus' // E-03
  | 'scientistHired'; // E-04 — "accelerates a solved bootstrap, must never SKIP it"

export type EventOptionEffect =
  | { kind: 'fundingPercentPenalty'; amount: number } // e.g. 0.05 = -5% of current Funding
  | { kind: 'haltProduction'; durationMs: number }
  | { kind: 'grant'; funding?: number; reputation?: number }
  | { kind: 'spendHardware'; amount: number }
  | { kind: 'confidencePenaltyNext'; amount: number }
  | { kind: 'freeScientistWithSalaryPremium'; salaryFlatPerSecond: number }
  | { kind: 'reputationAndTempDurationPenalty'; reputation: number; durationMult: number; expiresInMs: number }
  | { kind: 'buyMaterials'; fundingCost: number; materialsGained: number }
  | { kind: 'none' };

export interface EventOptionDef {
  narrativeId: string; // e.g. 'E-01a'
  effect: EventOptionEffect;
}

export interface EventDef {
  id: string; // E-01..E-06
  narrativeId: string; // same id — the title+flavor text, data/narrative.ts
  precondition: EventPreconditionId;
  optionA: EventOptionDef;
  optionB: EventOptionDef;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const EVENT_DEFS: EventDef[] = [
  {
    id: 'E-01',
    narrativeId: 'E-01',
    precondition: 'refineryBuilt',
    optionA: { narrativeId: 'E-01a', effect: { kind: 'fundingPercentPenalty', amount: 0.05 } },
    optionB: { narrativeId: 'E-01b', effect: { kind: 'haltProduction', durationMs: 20 * MIN } },
  },
  {
    id: 'E-02',
    narrativeId: 'E-02',
    precondition: 'complexBBuilt',
    optionA: { narrativeId: 'E-02a', effect: { kind: 'grant', funding: 1000, reputation: -10 } },
    optionB: { narrativeId: 'E-02b', effect: { kind: 'grant', reputation: 3 } },
  },
  {
    id: 'E-03',
    narrativeId: 'E-03',
    precondition: 'hardware15Plus',
    optionA: { narrativeId: 'E-03a', effect: { kind: 'spendHardware', amount: 15 } },
    optionB: { narrativeId: 'E-03b', effect: { kind: 'confidencePenaltyNext', amount: 10 } },
  },
  {
    id: 'E-04',
    narrativeId: 'E-04',
    precondition: 'scientistHired',
    optionA: { narrativeId: 'E-04a', effect: { kind: 'freeScientistWithSalaryPremium', salaryFlatPerSecond: 0.6 } },
    optionB: { narrativeId: 'E-04b', effect: { kind: 'none' } },
  },
  {
    id: 'E-05',
    narrativeId: 'E-05',
    precondition: 'complexBBuilt',
    optionA: {
      narrativeId: 'E-05a',
      effect: { kind: 'reputationAndTempDurationPenalty', reputation: 15, durationMult: 1.1, expiresInMs: 2 * HOUR },
    },
    optionB: { narrativeId: 'E-05b', effect: { kind: 'none' } },
  },
  {
    id: 'E-06',
    narrativeId: 'E-06',
    precondition: 'complexBBuilt',
    optionA: { narrativeId: 'E-06a', effect: { kind: 'buyMaterials', fundingCost: 200, materialsGained: 300 } },
    optionB: { narrativeId: 'E-06b', effect: { kind: 'none' } },
  },
];

export const EVENT_DEFS_BY_ID: Map<string, EventDef> = new Map(EVENT_DEFS.map((d) => [d.id, d]));

// NARRATIVE §3 rules text: "15% check per 10 active min, >=30 min apart, never during countdown."
export const EVENT_CHECK_INTERVAL_MS = 10 * MIN;
export const EVENT_CHECK_PROBABILITY = 0.15;
export const EVENT_MIN_GAP_MS = 30 * MIN;
