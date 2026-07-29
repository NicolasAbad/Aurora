import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import {
  buyXpNode,
  DEFAULT_FLIGHT_XP_TREE_STATE,
  isXpNodeAvailable,
  isXpNodeVisible,
  PARTIAL_REUSABILITY_RECOVERY_RATE,
  recoveredPropellant,
  XP_NODES_PENDING_DESIGN,
} from './flightXp';
import { XP_TREE_BY_ID } from '../data/flightXpTree';

function node(id: string) {
  const n = XP_TREE_BY_ID.get(id);
  if (!n) throw new Error(`unknown xp node id: ${id}`);
  return n;
}

function resourcesWithFlightXp(amount: number): ReturnType<typeof createInitialState>['resources'] {
  const resources = createInitialState().resources;
  return { ...resources, flightxp: { ...resources.flightxp, amount } };
}

describe('isXpNodeAvailable', () => {
  it('a no-dep node is available from the start', () => {
    expect(isXpNodeAvailable(node('efficientMixtures'), [])).toBe(true);
  });

  it('a dependent node is unavailable until its dep is purchased', () => {
    expect(isXpNodeAvailable(node('optimizedIgnition'), [])).toBe(false);
    expect(isXpNodeAvailable(node('optimizedIgnition'), ['efficientMixtures'])).toBe(true);
  });

  it('an already-purchased node is not "available" (nothing to buy)', () => {
    expect(isXpNodeAvailable(node('efficientMixtures'), ['efficientMixtures'])).toBe(false);
  });
});

describe('isXpNodeVisible — UI_SPEC §2b progressive disclosure', () => {
  it('a node one prerequisite away is visible (locked, teased)', () => {
    expect(isXpNodeVisible(node('optimizedIgnition'), [])).toBe(true);
  });

  it('a node two or more prerequisites away is fully hidden', () => {
    expect(isXpNodeVisible(node('partialReusability'), [])).toBe(false);
    expect(isXpNodeVisible(node('partialReusability'), ['efficientMixtures'])).toBe(true);
  });
});

describe('buyXpNode', () => {
  it('purchases an available, affordable node: spends XP, adds to purchased, registers its modifier', () => {
    const result = buyXpNode(resourcesWithFlightXp(150), DEFAULT_FLIGHT_XP_TREE_STATE, [], 'efficientMixtures');
    expect(result).not.toBeNull();
    expect(result!.resources.flightxp.amount).toBe(50); // 150 - 100
    expect(result!.flightXpTree.purchased).toEqual(['efficientMixtures']);
    expect(result!.modifiers).toEqual([
      { id: 'xp:efficientMixtures', source: 'efficientMixtures', target: 'launch.propellant', op: 'mult', value: 0.9 },
    ]);
  });

  it('refuses when Flight XP is short', () => {
    const result = buyXpNode(resourcesWithFlightXp(99), DEFAULT_FLIGHT_XP_TREE_STATE, [], 'efficientMixtures');
    expect(result).toBeNull();
  });

  it('refuses when deps are unmet', () => {
    const result = buyXpNode(resourcesWithFlightXp(1000), DEFAULT_FLIGHT_XP_TREE_STATE, [], 'optimizedIgnition');
    expect(result).toBeNull();
  });

  it('refuses when already purchased', () => {
    const result = buyXpNode(
      resourcesWithFlightXp(1000),
      { purchased: ['efficientMixtures'] },
      [],
      'efficientMixtures',
    );
    expect(result).toBeNull();
  });

  it('refuses an unknown node id', () => {
    const result = buyXpNode(resourcesWithFlightXp(1000), DEFAULT_FLIGHT_XP_TREE_STATE, [], 'notARealNode');
    expect(result).toBeNull();
  });

  // ECONOMY §9: "Partial reusability" has no declarative effect — a mechanic-change node
  // (recover 20% Propellant, applied directly at the point of use, not via the modifier
  // registry). Confirms the purchase itself still registers cleanly with no modifier.
  it('purchases a mechanic-change node (Partial reusability) with no modifier registered', () => {
    const result = buyXpNode(
      resourcesWithFlightXp(1000),
      { purchased: ['efficientMixtures', 'optimizedIgnition'] },
      [],
      'partialReusability',
    );
    expect(result).not.toBeNull();
    expect(result!.flightXpTree.purchased).toContain('partialReusability');
    expect(result!.modifiers).toEqual([]);
  });

  // Sprint 10 design-question thread: Parallel integration's exact mechanic isn't
  // resolvable without design input yet — refused outright even when otherwise available
  // and affordable, same "visible, priced, but not yet live" treatment as a v2-marked
  // upgrade never rendering a working purchase path.
  it('refuses Parallel integration — pending design, per XP_NODES_PENDING_DESIGN', () => {
    expect(XP_NODES_PENDING_DESIGN).toContain('parallelIntegration');
    const result = buyXpNode(
      resourcesWithFlightXp(1000),
      { purchased: ['efficientMixtures', 'optimizedIgnition', 'partialReusability', 'procedures', 'turnaround'] },
      [],
      'parallelIntegration',
    );
    expect(result).toBeNull();
  });
});

describe('recoveredPropellant — Partial reusability', () => {
  it('recovers nothing when not purchased', () => {
    expect(recoveredPropellant(400, [])).toBe(0);
  });

  it(`recovers ${PARTIAL_REUSABILITY_RECOVERY_RATE * 100}% of the spent amount once purchased`, () => {
    expect(recoveredPropellant(400, ['partialReusability'])).toBe(80);
  });
});
