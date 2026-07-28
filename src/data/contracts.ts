// ECONOMY_MODEL.md §10 (v3.6) + §8's per-tier contract rewards. Do not edit numbers here
// without editing them there first (CLAUDE.md rule 1). Tier 0 shipped in Sprint 6; tiers
// 1/2 (satellite contracts, post-Aurora I) ship in Sprint 9 — see SATELLITE_BUILD below
// and core/contractMission.ts for how they actually get built and launched.
import type { HardwareTier } from '../core/types';

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

// NARRATIVE_EVENTS §4: tier-1 (single satellites) and tier-2 (constellation batches, a
// recurring client class — same two clients repeat rather than rotating a larger pool).
export const TIER1_CLIENTS = ['TerraWatch Inc.', 'TelCom Global', 'National Space Agency'];
export const TIER2_CLIENTS = ['LinkSphere', 'OrbitNet'];

// ECONOMY §10 v3.6: satellite contracts share Aurora I's per-pad checklist/Confidence/
// roll-commitment machinery (core/contractMission.ts) but build via a SINGLE "Payload
// integration" stage rather than Aurora's 5-stage VAB breakdown — a routine contract
// satellite doesn't carry the flagship mission's narrative weight. Duration scales to
// Aurora I's own established Hardware-per-minute integration density (90 H / 75 min):
// 50,000 ms per Hardware unit. After integration, the pad reuses the SAME padTransfer
// (5 min, data/auroraI.ts's own stage — no cost, so nothing tier-specific to override)
// and propellantLoad timing Aurora uses, at each tier's own Propellant total; flight
// review is free (0 Research — §10 never listed a cost for it).
export const CONTRACT_PAYLOAD_STAGE_ID = 'payloadIntegration';
const HARDWARE_MS_PER_UNIT = 50_000; // 90 H / 75 min, ECONOMY §10 v3.6

export interface SatelliteBuildDef {
  hardware: number;
  minHardwareTier?: HardwareTier;
  propellant: number;
  integrationDurationMs: number;
  reputationGate: number;
  requiresCleanRoom: boolean;
}

export const SATELLITE_BUILD: Record<1 | 2, SatelliteBuildDef> = {
  1: {
    hardware: 40,
    propellant: 250,
    integrationDurationMs: 40 * HARDWARE_MS_PER_UNIT, // 2,000,000 ms = 33 min 20 s
    reputationGate: 20,
    requiresCleanRoom: false,
  },
  2: {
    hardware: 80,
    minHardwareTier: 'titanium',
    propellant: 400,
    integrationDurationMs: 80 * HARDWARE_MS_PER_UNIT, // 4,000,000 ms = 66 min 40 s
    reputationGate: 50,
    requiresCleanRoom: true,
  },
};

// ECONOMY §10: "Total all-inclusive cost 10 H + 40 P = the standard S-1 (8 H assembly +
// 30 P launch) plus client payload integration (2 H + 10 P)." Modeled as an extra cost
// folded into the linked S-1's own assembly (+2 H) and launch (+10 P) — see
// core/soundingMission.ts.
export const TIER0_PAYLOAD_EXTRA_HARDWARE = 2;
export const TIER0_PAYLOAD_EXTRA_PROPELLANT = 10;

export const MISSED_DEADLINE_REPUTATION_PENALTY = 15; // floor 0
