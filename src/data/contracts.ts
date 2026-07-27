// ECONOMY_MODEL.md §10 (v3.1) + §8's per-tier contract rewards. Do not edit numbers here
// without editing them there first (CLAUDE.md rule 1). Tier 0 is the only tier
// implemented in Sprint 6 (Payload Processing doesn't exist until post-Aurora I); tiers
// 1/2 are listed now, same "every named future variant up front" precedent as
// EngineId/PadId, so Sprint 9 extending this file never needs a migration touch here —
// this is plain data, not schema, so there was never a migration risk either way, but
// keeping both tiers together in one place avoids a second source of truth later.
const MIN = 60_000;
const HOUR = 60 * MIN;

// ECONOMY §8's "Contract fulfilled" row grants its OWN Flight XP/Reputation/Flight Data
// on top of whatever the underlying flight itself pays (an S-1's own 15 XP/1 Rep/200
// Flight Data, ECONOMY §7a) — Reputation is the same number §10 states (cross-referenced
// there as "per §10"), but Flight XP and Flight Data have no such cross-reference, so
// they're genuinely additional, not a restatement.
export interface ContractTierDef {
  tier: 0 | 1 | 2;
  offerRotationMs: number; // how long an unaccepted offer stays on the table
  fulfillmentDeadlineMs: number; // countdown from acceptance
  reward: { funding: number; reputation: number; flightxp: number; flightData: number };
}

export const CONTRACT_TIERS: Record<0 | 1 | 2, ContractTierDef> = {
  0: {
    tier: 0,
    offerRotationMs: 6 * HOUR,
    fulfillmentDeadlineMs: 12 * HOUR,
    reward: { funding: 400, reputation: 3, flightxp: 40, flightData: 450 },
  },
  1: {
    tier: 1,
    offerRotationMs: 8 * HOUR,
    fulfillmentDeadlineMs: 24 * HOUR,
    reward: { funding: 3000, reputation: 10, flightxp: 60, flightData: 600 },
  },
  2: {
    tier: 2,
    offerRotationMs: 8 * HOUR,
    fulfillmentDeadlineMs: 36 * HOUR,
    reward: { funding: 8000, reputation: 25, flightxp: 80, flightData: 750 },
  },
};

// NARRATIVE_EVENTS §4: tier-0 sounding-payload clients.
export const TIER0_CLIENTS = [
  'Coastal State University',
  'Ionosphere Research Group',
  'MicroGravity Labs',
  'HamSat Collective',
];

// ECONOMY §10: "Total all-inclusive cost 10 H + 40 P = the standard S-1 (8 H assembly +
// 30 P launch) plus client payload integration (2 H + 10 P)." Modeled as an extra cost
// folded into the linked S-1's own assembly (+2 H) and launch (+10 P) — see
// core/soundingMission.ts.
export const TIER0_PAYLOAD_EXTRA_HARDWARE = 2;
export const TIER0_PAYLOAD_EXTRA_PROPELLANT = 10;

export const MISSED_DEADLINE_REPUTATION_PENALTY = 15; // floor 0
