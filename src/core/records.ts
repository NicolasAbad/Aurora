// ECONOMY_MODEL.md §8b: Program Records, auto-awarded once each, by event (never by
// launch number). Generic, tick-driven (like the N-04/N-05 narrative threshold checks in
// state/persistStore.ts) so a record fires the moment its durable state signal becomes
// true, with no imperative call site to remember at every place that signal could first
// become true — including retroactively, for a save where it already happened before
// this system existed (e.g. "firstIgnition" could already be true from a Sprint 5 save's
// scripted certification failure).
import { applyGrant } from './economy';
import type { GameState, RecordId } from './types';

export const RECORD_DEFS: Record<RecordId, { name: string; reward: { funding: number; reputation: number } }> = {
  firstIgnition: { name: 'First ignition', reward: { funding: 200, reputation: 3 } },
  firstFlight: { name: 'First flight', reward: { funding: 500, reputation: 5 } },
  pastKarman: { name: 'Past the Kármán line', reward: { funding: 1000, reputation: 8 } },
  firstOrbit: { name: 'First orbit', reward: { funding: 3000, reputation: 15 } },
  firstCustomer: { name: 'First customer', reward: { funding: 400, reputation: 3 } },
  firstDelivery: { name: 'First delivery', reward: { funding: 1500, reputation: 10 } },
};

export interface RecordCheckContext {
  probe1Attempted: boolean;
  s1Success: boolean;
  s2Success: boolean;
  auroraISuccess: boolean;
  contractAccepted: boolean;
  contractFulfilled: boolean;
}

export function contextFromState(
  state: Pick<GameState, 'certifications' | 'mission' | 'contracts'>,
): RecordCheckContext {
  return {
    probe1Attempted: state.certifications.engines.probe1.attempted, // "even the scripted failure"
    // "First flight"/"Kármán line" pair with N-08b/N-08c, both SUCCESS narrative beats
    // (N-08b: "Your first rocket flew... the lab already wants a second flight") — unlike
    // firstIgnition, neither trigger has an explicit "(even if it fails)" carve-out in
    // ECONOMY §8b, so both are gated on a successful flight, not merely an attempt.
    s1Success: state.mission.launches.some((l) => l.missionType === 's1' && l.success),
    s2Success: state.mission.launches.some((l) => l.missionType === 's2' && l.success),
    auroraISuccess: state.mission.launches.some((l) => l.missionType === 'auroraI' && l.success), // Sprint 7
    contractAccepted: state.contracts.active.length > 0,
    contractFulfilled: state.contracts.active.some((a) => a.fulfilled),
  };
}

const TRIGGERS: Record<RecordId, (ctx: RecordCheckContext) => boolean> = {
  firstIgnition: (ctx) => ctx.probe1Attempted,
  firstFlight: (ctx) => ctx.s1Success,
  pastKarman: (ctx) => ctx.s2Success,
  firstOrbit: (ctx) => ctx.auroraISuccess,
  firstCustomer: (ctx) => ctx.contractAccepted,
  firstDelivery: (ctx) => ctx.contractFulfilled,
};

export interface RecordsResolution {
  records: string[];
  resources: GameState['resources'];
  newlyEarned: RecordId[];
}

/** Checked every tick (and at offline boot) against durable, already-persisted signals
 * only — never needs its own imperative call site at the action that first makes one
 * true. Payouts are one-time grants ignoring caps (GDD §1c), same as every other reward. */
export function resolveRecords(
  records: string[],
  resources: GameState['resources'],
  ctx: RecordCheckContext,
): RecordsResolution {
  const newlyEarned: RecordId[] = [];
  let nextResources = resources;

  for (const id of Object.keys(TRIGGERS) as RecordId[]) {
    if (records.includes(id) || !TRIGGERS[id](ctx)) continue;
    newlyEarned.push(id);
    const reward = RECORD_DEFS[id].reward;
    nextResources = {
      ...nextResources,
      funding: applyGrant(nextResources.funding, reward.funding, true),
      reputation: applyGrant(nextResources.reputation, reward.reputation, true),
    };
  }

  if (newlyEarned.length === 0) return { records, resources, newlyEarned };
  return { records: [...records, ...newlyEarned], resources: nextResources, newlyEarned };
}
