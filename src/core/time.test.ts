import { describe, expect, it } from 'vitest';
import { progressFraction, remainingMs, resolveProcesses, startProcess } from './time';
import type { Process } from './types';

const MIN = 60_000;

function makeProcess(overrides: Partial<Process> = {}): Process {
  return {
    id: 'p1',
    kind: 'research',
    startedAt: 0,
    durationMs: 10 * MIN,
    payload: {},
    ...overrides,
  };
}

describe('startProcess', () => {
  it('appends a process stamped with the given startedAt (never reads the clock itself)', () => {
    const result = startProcess([], { id: 'p1', kind: 'research', durationMs: 5 * MIN, payload: {} }, 1000);
    expect(result).toEqual([{ id: 'p1', kind: 'research', durationMs: 5 * MIN, payload: {}, startedAt: 1000 }]);
  });
});

describe('resolveProcesses', () => {
  it('resolves a single process once startedAt + durationMs <= now', () => {
    const p = makeProcess({ startedAt: 0, durationMs: 10 * MIN });
    expect(resolveProcesses([p], 5 * MIN).completed).toEqual([]);
    expect(resolveProcesses([p], 10 * MIN).completed).toEqual([p]);
    expect(resolveProcesses([p], 20 * MIN).completed).toEqual([p]);
  });

  it('resolves multiple PARALLEL processes independently in one pass', () => {
    const fast = makeProcess({ id: 'fast', startedAt: 0, durationMs: 5 * MIN });
    const slow = makeProcess({ id: 'slow', startedAt: 0, durationMs: 20 * MIN });
    const atMidpoint = resolveProcesses([fast, slow], 10 * MIN);
    expect(atMidpoint.completed).toEqual([fast]);
    expect(atMidpoint.remaining).toEqual([slow]);
  });

  it('is purely timestamp-based: a huge jump in `now` resolves correctly in one pass, no drift from being checked minute-by-minute vs all at once', () => {
    const p = makeProcess({ startedAt: 0, durationMs: 10 * MIN });
    // Simulate "checked every minute" vs "checked once after a huge jump" — same answer.
    let steppedResult: ReturnType<typeof resolveProcesses> | null = null;
    for (let now = 0; now <= 12 * MIN; now += MIN) {
      steppedResult = resolveProcesses([p], now);
      if (steppedResult.completed.length > 0) break;
    }
    const jumpedResult = resolveProcesses([p], 12 * MIN);
    expect(steppedResult!.completed).toEqual(jumpedResult.completed);
  });
});

describe('remainingMs', () => {
  it('counts down and floors at 0', () => {
    const p = makeProcess({ startedAt: 1000, durationMs: 10 * MIN });
    expect(remainingMs(p, 1000)).toBe(10 * MIN);
    expect(remainingMs(p, 1000 + 4 * MIN)).toBe(6 * MIN);
    expect(remainingMs(p, 1000 + 999 * MIN)).toBe(0);
  });
});

describe('progressFraction', () => {
  it('goes from 0 to 1 over the process duration', () => {
    const p = makeProcess({ startedAt: 0, durationMs: 10 * MIN });
    expect(progressFraction(p, 0)).toBe(0);
    expect(progressFraction(p, 5 * MIN)).toBeCloseTo(0.5);
    expect(progressFraction(p, 10 * MIN)).toBe(1);
    expect(progressFraction(p, 20 * MIN)).toBe(1); // clamped, doesn't overshoot
  });

  it('treats a 0-duration process (e.g. an instant flight review) as immediately done', () => {
    const p = makeProcess({ durationMs: 0 });
    expect(progressFraction(p, 0)).toBe(1);
  });
});
