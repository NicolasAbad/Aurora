import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { TIER0_CLIENTS } from '../data/contracts';
import {
  acceptContract,
  activePendingContracts,
  isOfferPending,
  maybeGenerateTierZeroOffer,
  resolveContractDeadlines,
} from './contracts';
import type { ContractState } from './types';

const HOUR = 60 * 60_000;

function contracts(overrides: Partial<ContractState> = {}): ContractState {
  return { ...createInitialState().contracts, ...overrides };
}

describe('maybeGenerateTierZeroOffer', () => {
  it('does nothing before the Launch Rail is built', () => {
    const result = maybeGenerateTierZeroOffer(contracts(), false, 0);
    expect(result.offers).toHaveLength(0);
  });

  it('generates one tier-0 offer when none is pending', () => {
    const result = maybeGenerateTierZeroOffer(contracts(), true, 1000, () => 0);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({ tier: 0, offeredAt: 1000, deadlineMs: 6 * HOUR, client: TIER0_CLIENTS[0] });
  });

  it('does not generate a second offer while one is still pending', () => {
    const first = maybeGenerateTierZeroOffer(contracts(), true, 0);
    const second = maybeGenerateTierZeroOffer(first, true, 1000);
    expect(second.offers).toHaveLength(1);
  });

  it('generates a fresh offer once the previous one expired unaccepted', () => {
    const first = maybeGenerateTierZeroOffer(contracts(), true, 0);
    const second = maybeGenerateTierZeroOffer(first, true, 6 * HOUR + 1);
    expect(second.offers).toHaveLength(2);
  });

  it('generates a fresh offer once the previous one was accepted (frees the "1 offer" slot)', () => {
    const first = maybeGenerateTierZeroOffer(contracts(), true, 0);
    const accepted = acceptContract(first, first.offers[0].id, 100)!;
    const second = maybeGenerateTierZeroOffer(accepted, true, 200);
    expect(second.offers).toHaveLength(2);
  });
});

describe('isOfferPending', () => {
  it('is pending before its deadline and while unaccepted', () => {
    const state = contracts({ offers: [{ id: 'o1', tier: 0, client: 'X', offeredAt: 0, deadlineMs: 6 * HOUR }] });
    expect(isOfferPending(state.offers[0], state, 1000)).toBe(true);
  });

  it('is not pending once its deadline has passed', () => {
    const state = contracts({ offers: [{ id: 'o1', tier: 0, client: 'X', offeredAt: 0, deadlineMs: 6 * HOUR }] });
    expect(isOfferPending(state.offers[0], state, 6 * HOUR + 1)).toBe(false);
  });

  it('is not pending once accepted', () => {
    const state = contracts({
      offers: [{ id: 'o1', tier: 0, client: 'X', offeredAt: 0, deadlineMs: 6 * HOUR }],
      active: [{ offerId: 'o1', acceptedAt: 100, padId: null, fulfilled: false }],
    });
    expect(isOfferPending(state.offers[0], state, 200)).toBe(false);
  });
});

describe('acceptContract', () => {
  it('accepts a pending offer, free of cost', () => {
    const state = contracts({ offers: [{ id: 'o1', tier: 0, client: 'X', offeredAt: 0, deadlineMs: 6 * HOUR }] });
    const result = acceptContract(state, 'o1', 1000);
    expect(result).not.toBeNull();
    expect(result!.active).toEqual([{ offerId: 'o1', acceptedAt: 1000, padId: null, fulfilled: false }]);
  });

  it('refuses an unknown offer id', () => {
    expect(acceptContract(contracts(), 'nope', 0)).toBeNull();
  });

  it('refuses an expired offer', () => {
    const state = contracts({ offers: [{ id: 'o1', tier: 0, client: 'X', offeredAt: 0, deadlineMs: 6 * HOUR }] });
    expect(acceptContract(state, 'o1', 6 * HOUR + 1)).toBeNull();
  });

  it('refuses an already-accepted offer', () => {
    const state = contracts({
      offers: [{ id: 'o1', tier: 0, client: 'X', offeredAt: 0, deadlineMs: 6 * HOUR }],
      active: [{ offerId: 'o1', acceptedAt: 100, padId: null, fulfilled: false }],
    });
    expect(acceptContract(state, 'o1', 200)).toBeNull();
  });
});

describe('activePendingContracts', () => {
  it('excludes fulfilled and deadline-missed contracts, keeps everything else', () => {
    const state = contracts({
      active: [
        { offerId: 'o1', acceptedAt: 0, padId: null, fulfilled: false },
        { offerId: 'o2', acceptedAt: 0, padId: null, fulfilled: true },
        { offerId: 'o3', acceptedAt: 0, padId: null, fulfilled: false, deadlineMissed: true },
      ],
    });
    expect(activePendingContracts(state).map((a) => a.offerId)).toEqual(['o1']);
  });
});

describe('resolveContractDeadlines', () => {
  it('does nothing while an active contract is still within its fulfillment deadline', () => {
    const state = contracts({
      offers: [{ id: 'o1', tier: 0, client: 'X', offeredAt: 0, deadlineMs: 6 * HOUR }],
      active: [{ offerId: 'o1', acceptedAt: 0, padId: null, fulfilled: false }],
    });
    const resources = createInitialState().resources;
    const result = resolveContractDeadlines(state, resources, 6 * HOUR); // tier-0 deadline is 12h
    expect(result.contracts).toBe(state);
    expect(result.resources).toBe(resources);
  });

  it('applies -15 Reputation once the fulfillment deadline passes, and marks deadlineMissed', () => {
    const state = contracts({
      offers: [{ id: 'o1', tier: 0, client: 'X', offeredAt: 0, deadlineMs: 6 * HOUR }],
      active: [{ offerId: 'o1', acceptedAt: 0, padId: null, fulfilled: false }],
    });
    const resources = createInitialState().resources;
    resources.reputation.amount = 20;

    const result = resolveContractDeadlines(state, resources, 12 * HOUR + 1);
    expect(result.resources.reputation.amount).toBe(5);
    expect(result.contracts.active[0].deadlineMissed).toBe(true);
  });

  it('floors the Reputation penalty at 0', () => {
    const state = contracts({
      offers: [{ id: 'o1', tier: 0, client: 'X', offeredAt: 0, deadlineMs: 6 * HOUR }],
      active: [{ offerId: 'o1', acceptedAt: 0, padId: null, fulfilled: false }],
    });
    const resources = createInitialState().resources;
    resources.reputation.amount = 5;

    const result = resolveContractDeadlines(state, resources, 12 * HOUR + 1);
    expect(result.resources.reputation.amount).toBe(0);
  });

  it('never re-penalizes a contract already marked deadlineMissed', () => {
    const state = contracts({
      offers: [{ id: 'o1', tier: 0, client: 'X', offeredAt: 0, deadlineMs: 6 * HOUR }],
      active: [{ offerId: 'o1', acceptedAt: 0, padId: null, fulfilled: false, deadlineMissed: true }],
    });
    const resources = createInitialState().resources;
    resources.reputation.amount = 20;
    const result = resolveContractDeadlines(state, resources, 100 * HOUR);
    expect(result.resources.reputation.amount).toBe(20);
  });

  it('never penalizes a fulfilled contract', () => {
    const state = contracts({
      offers: [{ id: 'o1', tier: 0, client: 'X', offeredAt: 0, deadlineMs: 6 * HOUR }],
      active: [{ offerId: 'o1', acceptedAt: 0, padId: null, fulfilled: true }],
    });
    const resources = createInitialState().resources;
    resources.reputation.amount = 20;
    const result = resolveContractDeadlines(state, resources, 100 * HOUR);
    expect(result.resources.reputation.amount).toBe(20);
  });
});
