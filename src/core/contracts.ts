// ECONOMY §10: contract offers, acceptance and deadline penalties. Sprint 6 built tier 0;
// Sprint 9 adds tiers 1/2 (satellite contracts, post-Aurora I — core/contractMission.ts
// owns the actual build/launch flow once accepted).
import {
  CONTRACT_TIERS,
  MISSED_DEADLINE_REPUTATION_PENALTY,
  TIER0_CLIENTS,
  TIER1_CLIENTS,
  TIER2_CLIENTS,
} from '../data/contracts';
import type { ActiveContract, ContractOffer, ContractState, GameState } from './types';

/** Contracts accepted but not yet fulfilled or missed — what's still worth pursuing
 * (used by the Contracts panel and by the sounding-mission UI's "fulfill contract" link). */
export function activePendingContracts(contracts: ContractState): ActiveContract[] {
  return contracts.active.filter((a) => !a.fulfilled && !a.deadlineMissed);
}

/** True if `offer` is still on the table: not expired, not already accepted. */
export function isOfferPending(offer: ContractOffer, contracts: ContractState, now: number): boolean {
  if (now >= offer.offeredAt + offer.deadlineMs) return false;
  return !contracts.active.some((a) => a.offerId === offer.id);
}

/**
 * ECONOMY §10: "1 active [tier-0] offer, rotates 6 h." Generates a fresh offer whenever
 * none is currently pending — whether because the last one expired unaccepted or was
 * just accepted (both free up the same "1 offer" slot identically). No-ops before the
 * Launch Rail is built ("active from Launch Rail; no Payload Processing needed").
 */
export function maybeGenerateTierZeroOffer(
  contracts: ContractState,
  launchRailBuilt: boolean,
  now: number,
  randomFn: () => number = Math.random,
): ContractState {
  if (!launchRailBuilt) return contracts;
  const hasPending = contracts.offers.some((o) => o.tier === 0 && isOfferPending(o, contracts, now));
  if (hasPending) return contracts;

  const client = TIER0_CLIENTS[Math.floor(randomFn() * TIER0_CLIENTS.length)];
  const offer: ContractOffer = {
    id: `contract-0-${now}`,
    tier: 0,
    client,
    offeredAt: now,
    deadlineMs: CONTRACT_TIERS[0].offerRotationMs,
  };
  return { ...contracts, offers: [...contracts.offers, offer] };
}

const SATELLITE_CLIENTS: Record<1 | 2, readonly string[]> = {
  1: TIER1_CLIENTS,
  2: TIER2_CLIENTS,
};

/**
 * ECONOMY §10 v3.6: "Satellite tiers (post-Aurora I; 2 active offers, rotate 8h; require
 * Payload Processing)." Read as one dedicated offer slot per tier (tier 1 and tier 2 each
 * independently rotating every 8h) rather than 2 slots randomly drawing from either tier
 * — the doc's own two-row table gives each tier its own client pool, deadline-shared
 * rotation cadence, and requirement set, so this is the direct reading, not an invented
 * mechanic. Mirrors maybeGenerateTierZeroOffer exactly, generalized by tier. Clean Room
 * (tier 2's extra building prerequisite) gates BUILDING the payload, not the offer
 * appearing — same "Requires" column as the Hardware/Propellant/Reputation figures, all
 * checked at build-start time (core/contractMission.ts), not offer-generation time.
 */
export function maybeGenerateSatelliteOffer(
  tier: 1 | 2,
  contracts: ContractState,
  payloadProcessingBuilt: boolean,
  now: number,
  randomFn: () => number = Math.random,
): ContractState {
  if (!payloadProcessingBuilt) return contracts;
  const hasPending = contracts.offers.some((o) => o.tier === tier && isOfferPending(o, contracts, now));
  if (hasPending) return contracts;

  const clients = SATELLITE_CLIENTS[tier];
  const client = clients[Math.floor(randomFn() * clients.length)];
  const offer: ContractOffer = {
    id: `contract-${tier}-${now}`,
    tier,
    client,
    offeredAt: now,
    deadlineMs: CONTRACT_TIERS[tier].offerRotationMs,
  };
  return { ...contracts, offers: [...contracts.offers, offer] };
}

/** Accepts a still-pending offer. Free (ECONOMY §10: "Declining: free (v1)" — accepting
 * has no separate cost either; the all-inclusive cost is paid when the linked flight is
 * actually assembled, core/soundingMission.ts). */
export function acceptContract(contracts: ContractState, offerId: string, now: number): ContractState | null {
  const offer = contracts.offers.find((o) => o.id === offerId);
  if (!offer || !isOfferPending(offer, contracts, now)) return null;

  return {
    ...contracts,
    active: [...contracts.active, { offerId, acceptedAt: now, padId: null, fulfilled: false }],
  };
}

export interface ContractDeadlineResolution {
  contracts: ContractState;
  resources: GameState['resources'];
}

/**
 * ECONOMY §10: "Missed deadline: −15 Reputation (floor 0)." A failed launch does NOT
 * miss the deadline by itself — the contract stays active until its own deadline passes
 * unfulfilled (core/soundingMission.ts's launch resolver never touches this). Marks
 * `deadlineMissed` so a tick-driven check (this function, called every tick like the
 * narrative threshold checks) never re-penalizes the same contract twice.
 */
export function resolveContractDeadlines(
  contracts: ContractState,
  resources: GameState['resources'],
  now: number,
): ContractDeadlineResolution {
  let penalty = 0;
  const active = contracts.active.map((a) => {
    if (a.fulfilled || a.deadlineMissed) return a;
    const offer = contracts.offers.find((o) => o.id === a.offerId);
    if (!offer) return a;
    const deadline = a.acceptedAt + CONTRACT_TIERS[offer.tier].fulfillmentDeadlineMs;
    if (now < deadline) return a;
    penalty += MISSED_DEADLINE_REPUTATION_PENALTY;
    return { ...a, deadlineMissed: true };
  });

  if (penalty === 0) return { contracts, resources };
  return {
    contracts: { ...contracts, active },
    resources: {
      ...resources,
      reputation: { ...resources.reputation, amount: Math.max(0, resources.reputation.amount - penalty) },
    },
  };
}
