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
    expect(result.justCompleted).toBeNull();
  });

  it('does nothing before the duration has elapsed', () => {
    const process: Process = { id: 'r1', kind: 'research', startedAt: 0, durationMs: 10 * MIN, payload: { nodeId: 'aluminum' } };
    const result = resolveResearch(makeState({ inProgress: process }), [], 5 * MIN);
    expect(result.justCompleted).toBeNull();
    expect(result.research.inProgress).toBe(process);
  });

  it('completes a no-effect node: added to completed, inProgress cleared, no modifier registered', () => {
    const process: Process = { id: 'r1', kind: 'research', startedAt: 0, durationMs: 5 * MIN, payload: { nodeId: 'aluminum' } };
    const result = resolveResearch(makeState({ inProgress: process }), [], 5 * MIN);
    expect(result.justCompleted).toBe('aluminum');
    expect(result.research.completed).toEqual(['aluminum']);
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

  it('is purely timestamp-based: a huge jump in `now` resolves the same as checking incrementally', () => {
    const process: Process = { id: 'r1', kind: 'research', startedAt: 0, durationMs: 5 * MIN, payload: { nodeId: 'aluminum' } };
    const jumped = resolveResearch(makeState({ inProgress: process }), [], 12 * MIN);
    expect(jumped.justCompleted).toBe('aluminum');
  });
});
