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
});
