import { describe, expect, it } from 'vitest';
import { isNodeAvailable, isNodeVisible, resolveResearch, type ResearchState } from './research';
import { RESEARCH_BY_ID } from '../data/researchTree';
import type { Process } from './types';

const MIN = 60_000;

function node(id: string) {
  const n = RESEARCH_BY_ID.get(id);
  if (!n) throw new Error(`unknown test node id: ${id}`);
  return n;
}

describe('isNodeAvailable', () => {
  it('a no-dep node is available from the start', () => {
    expect(isNodeAvailable(node('aluminum'), [])).toBe(true);
  });

  it('a dependent node is unavailable until its dep completes', () => {
    expect(isNodeAvailable(node('titanium'), [])).toBe(false);
    expect(isNodeAvailable(node('titanium'), ['aluminum'])).toBe(true);
  });

  it('an already-completed node is not "available" (nothing to start)', () => {
    expect(isNodeAvailable(node('aluminum'), ['aluminum'])).toBe(false);
  });

  // ECONOMY §5b v4.1 (Sprint 11.5): Probe-1 engine also requires the Test Stand BUILT,
  // not just Sounding rockets researched — a real building prerequisite, separate from
  // the tech dep chain.
  describe('buildingDep (ECONOMY §5b v4.1)', () => {
    it('is unavailable once its tech dep is met but the building is not built', () => {
      expect(isNodeAvailable(node('probe1Engine'), ['soundingRockets'])).toBe(false);
      expect(isNodeAvailable(node('probe1Engine'), ['soundingRockets'], { testStand: 0 })).toBe(false);
    });

    it('is available once both the tech dep AND the building are met', () => {
      expect(isNodeAvailable(node('probe1Engine'), ['soundingRockets'], { testStand: 1 })).toBe(true);
    });

    it('a node with no buildingDep is unaffected by the buildingLevels argument', () => {
      expect(isNodeAvailable(node('aluminum'), [], {})).toBe(true);
      expect(isNodeAvailable(node('aluminum'), [], { testStand: 0 })).toBe(true);
    });
  });

  // ECONOMY §5c v4.3 (Sprint 11.6): mutually-exclusive forks — a real, permanent
  // playstyle choice, not just a sequencing preference.
  describe('excludes (fork exclusivity, Sprint 11.6)', () => {
    const deps = ['titanium', 'ignitionSequencing']; // leanFabrication/volumeFabrication's shared deps

    it('both fork sides are available before either is chosen', () => {
      expect(isNodeAvailable(node('leanFabrication'), deps)).toBe(true);
      expect(isNodeAvailable(node('volumeFabrication'), deps)).toBe(true);
    });

    it('completing one side permanently excludes the other, symmetrically', () => {
      expect(isNodeAvailable(node('volumeFabrication'), [...deps, 'leanFabrication'])).toBe(false);
      expect(isNodeAvailable(node('leanFabrication'), [...deps, 'volumeFabrication'])).toBe(false);
    });
  });

  // ECONOMY §5c v4.3: a repeatable node is never "completed" in the exclusionary sense —
  // its own purchase count is its progress, so it stays available indefinitely.
  describe('repeatable nodes (Sprint 11.6)', () => {
    it('is available with 0 prior purchases once its dep is met', () => {
      expect(isNodeAvailable(node('appliedMaterialsScience'), ['consumptionCalibration'])).toBe(true);
    });

    it('stays available after several purchases (no maxPurchases set on this node)', () => {
      expect(
        isNodeAvailable(node('appliedMaterialsScience'), ['consumptionCalibration'], {}, { appliedMaterialsScience: 7 }),
      ).toBe(true);
    });

    it('is unavailable once maxPurchases is reached, for a node that declares one', () => {
      const capped = { ...node('appliedMaterialsScience'), repeatable: { costGrowthFactor: 1.8, maxPurchases: 2 } };
      expect(isNodeAvailable(capped, ['consumptionCalibration'], {}, { appliedMaterialsScience: 1 })).toBe(true);
      expect(isNodeAvailable(capped, ['consumptionCalibration'], {}, { appliedMaterialsScience: 2 })).toBe(false);
    });
  });
});

describe('isNodeVisible — UI_SPEC §2b progressive disclosure', () => {
  it('available and completed nodes are visible', () => {
    expect(isNodeVisible(node('aluminum'), [])).toBe(true);
    expect(isNodeVisible(node('aluminum'), ['aluminum'])).toBe(true);
  });

  it('a node exactly one prerequisite away is visible (locked, teased)', () => {
    // aluminum not yet done, but available -> titanium (its sole dependent) is visible.
    expect(isNodeVisible(node('titanium'), [])).toBe(true);
  });

  it('a node two or more prerequisites away is fully hidden', () => {
    // In the Program branch: basicEngineering -> scientificMethod -> testStand -> ...
    // With nothing completed, testStand is two steps past the available frontier.
    expect(isNodeVisible(node('testStand'), [])).toBe(false);
    // Once basicEngineering is done, scientificMethod becomes available and testStand
    // becomes the new one-away tease.
    expect(isNodeVisible(node('testStand'), ['basicEngineering'])).toBe(true);
  });

  // ECONOMY §5b / UI_SPEC §4 (v4.1): "never a bare padlock" — a node whose tech deps are
  // all met but whose OWN buildingDep isn't yet still needs to be visible so the player
  // can see the real reason (build the Test Stand), not have it silently vanish.
  it('a node whose tech deps are met but buildingDep is not stays visible', () => {
    expect(isNodeVisible(node('probe1Engine'), ['soundingRockets'])).toBe(true);
    expect(isNodeVisible(node('probe1Engine'), ['soundingRockets'], { testStand: 0 })).toBe(true);
  });

  // ECONOMY §5c v4.3 (Sprint 11.6): a fork-excluded node stays visible (showing WHY it's
  // gone, per UI_SPEC §4's "never a bare padlock") rather than vanishing once its sibling
  // is chosen — its own deps are still met, which is exactly why it's excluded, not locked.
  it('a fork-excluded node stays visible', () => {
    const deps = ['titanium', 'ignitionSequencing', 'leanFabrication'];
    expect(isNodeVisible(node('volumeFabrication'), deps)).toBe(true);
  });
});

describe('resolveResearch', () => {
  function makeState(overrides: Partial<ResearchState> = {}): ResearchState {
    return { completed: [], inProgress: null, ...overrides };
  }

  it('does nothing when no research is in progress', () => {
    const result = resolveResearch(makeState(), [], Date.now());
    expect(result.justCompletedIds).toEqual([]);
  });

  it('does nothing before the duration has elapsed', () => {
    const process: Process = { id: 'r1', kind: 'research', startedAt: 0, durationMs: 10 * MIN, payload: { nodeId: 'soundingRockets' } };
    const result = resolveResearch(makeState({ inProgress: process }), [], 5 * MIN);
    expect(result.justCompletedIds).toEqual([]);
    expect(result.research.inProgress).toBe(process);
  });

  it('completes a no-effect node: added to completed, inProgress cleared, no modifier registered', () => {
    const process: Process = { id: 'r1', kind: 'research', startedAt: 0, durationMs: 4 * MIN, payload: { nodeId: 'soundingRockets' } };
    const result = resolveResearch(makeState({ inProgress: process }), [], 4 * MIN);
    expect(result.justCompletedIds).toEqual(['soundingRockets']);
    expect(result.research.completed).toEqual(['soundingRockets']);
    expect(result.research.inProgress).toBeNull();
    expect(result.modifiers).toEqual([]);
  });

  it('completes an effect-bearing node and registers its modifier (Basic logistics)', () => {
    const process: Process = {
      id: 'r1',
      kind: 'research',
      startedAt: 0,
      durationMs: 15 * MIN,
      payload: { nodeId: 'basicLogistics' },
    };
    const result = resolveResearch(makeState({ inProgress: process }), [], 15 * MIN);
    expect(result.research.completed).toEqual(['basicLogistics']);
    expect(result.modifiers).toEqual([
      { id: 'research:basicLogistics', source: 'basicLogistics', target: 'transfer.duration', op: 'mult', value: 0.75 },
    ]);
  });

  // ECONOMY §5 v3.6: Aluminum alloys gained a real effect (Sprint 8 economy unlock,
  // BACKLOG contingency met) — confirms it now registers like any other effect-bearing node.
  it('completes Aluminum alloys and registers its Fabrication-consumption modifier', () => {
    const process: Process = { id: 'r1', kind: 'research', startedAt: 0, durationMs: 5 * MIN, payload: { nodeId: 'aluminum' } };
    const result = resolveResearch(makeState({ inProgress: process }), [], 5 * MIN);
    expect(result.justCompletedIds).toEqual(['aluminum']);
    expect(result.modifiers).toEqual([
      { id: 'research:aluminum', source: 'aluminum', target: 'fabrication.materialsPerHardware', op: 'mult', value: 0.9 },
    ]);
  });

  it('is purely timestamp-based: a huge jump in `now` resolves the same as checking incrementally', () => {
    const process: Process = { id: 'r1', kind: 'research', startedAt: 0, durationMs: 5 * MIN, payload: { nodeId: 'soundingRockets' } };
    const jumped = resolveResearch(makeState({ inProgress: process }), [], 12 * MIN);
    expect(jumped.justCompletedIds).toEqual(['soundingRockets']);
  });

  // ECONOMY §4 v3.6: Second research track — both slots resolve independently.
  describe('second research track (secondInProgress)', () => {
    it('resolves only the second slot when just it finishes', () => {
      const first: Process = { id: 'r1', kind: 'research', startedAt: 0, durationMs: 20 * MIN, payload: { nodeId: 'soundingRockets' } };
      const second: Process = { id: 'r2', kind: 'research', startedAt: 0, durationMs: 5 * MIN, payload: { nodeId: 'aluminum' } };
      const result = resolveResearch(makeState({ inProgress: first, secondInProgress: second }), [], 5 * MIN);
      expect(result.justCompletedIds).toEqual(['aluminum']);
      expect(result.research.inProgress).toBe(first);
      expect(result.research.secondInProgress).toBeNull();
      expect(result.research.completed).toEqual(['aluminum']);
    });

    it('resolves both slots in the same call when both are done', () => {
      const first: Process = { id: 'r1', kind: 'research', startedAt: 0, durationMs: 4 * MIN, payload: { nodeId: 'soundingRockets' } };
      const second: Process = { id: 'r2', kind: 'research', startedAt: 0, durationMs: 5 * MIN, payload: { nodeId: 'aluminum' } };
      const result = resolveResearch(makeState({ inProgress: first, secondInProgress: second }), [], 10 * MIN);
      expect(result.justCompletedIds).toEqual(['soundingRockets', 'aluminum']);
      expect(result.research.inProgress).toBeNull();
      expect(result.research.secondInProgress).toBeNull();
      expect(result.research.completed).toEqual(['soundingRockets', 'aluminum']);
    });

    it('a save with no second track (secondInProgress undefined) resolves exactly as before', () => {
      const process: Process = { id: 'r1', kind: 'research', startedAt: 0, durationMs: 5 * MIN, payload: { nodeId: 'soundingRockets' } };
      const result = resolveResearch(makeState({ inProgress: process }), [], 5 * MIN);
      expect(result.justCompletedIds).toEqual(['soundingRockets']);
      expect(result.research.secondInProgress).toBeNull();
    });
  });

  // ECONOMY §5c v4.3 (Sprint 11.6): a repeatable node's completion never joins
  // `completed` — its own repeatablePurchases count is its progress, and each purchase
  // registers its OWN modifier id so purchases stack instead of the 2nd+ being dropped.
  describe('repeatable nodes (Sprint 11.6)', () => {
    function repeatableProcess(startedAt = 0): Process {
      return { id: 'r1', kind: 'research', startedAt, durationMs: 60 * MIN, payload: { nodeId: 'appliedMaterialsScience' } };
    }

    it('the first purchase does NOT join `completed`, and registers purchase-1 modifier', () => {
      const result = resolveResearch(makeState({ inProgress: repeatableProcess() }), [], 60 * MIN);
      expect(result.justCompletedIds).toEqual(['appliedMaterialsScience']);
      expect(result.research.completed).toEqual([]);
      expect(result.research.repeatablePurchases).toEqual({ appliedMaterialsScience: 1 });
      expect(result.modifiers).toEqual([
        {
          id: 'research:appliedMaterialsScience:1',
          source: 'appliedMaterialsScience',
          target: 'fabrication.materialsPerHardware',
          op: 'mult',
          value: 0.98,
        },
      ]);
    });

    it('a second purchase increments the count and STACKS a second distinct modifier', () => {
      const first = resolveResearch(makeState({ inProgress: repeatableProcess() }), [], 60 * MIN);
      const state2: ResearchState = { ...first.research, inProgress: repeatableProcess(60 * MIN) };
      const second = resolveResearch(state2, first.modifiers, 120 * MIN);
      expect(second.research.repeatablePurchases).toEqual({ appliedMaterialsScience: 2 });
      expect(second.modifiers).toHaveLength(2);
      expect(second.modifiers.map((m) => m.id)).toEqual([
        'research:appliedMaterialsScience:1',
        'research:appliedMaterialsScience:2',
      ]);
    });
  });
});
