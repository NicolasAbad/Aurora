import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { useSettings } from '../state/settings';
import { useRollingNumber } from './useRollingNumber';

function Probe({ target, durationMs }: { target: number; durationMs: number }) {
  const value = useRollingNumber(target, durationMs);
  return createElement('span', { 'data-testid': 'value' }, value.toFixed(2));
}

describe('useRollingNumber', () => {
  const originalReducedMotion = useSettings.getState().reducedMotion;

  afterEach(() => {
    useSettings.setState({ reducedMotion: originalReducedMotion });
  });

  it('snaps straight to target with no animation when reducedMotion is on', () => {
    useSettings.setState({ reducedMotion: true });
    const { getByTestId } = render(createElement(Probe, { target: 500, durationMs: 50 }));
    expect(getByTestId('value').textContent).toBe('500.00');
  });

  it('eases toward the target over time and converges when reducedMotion is off', async () => {
    useSettings.setState({ reducedMotion: false });
    const { getByTestId, rerender } = render(createElement(Probe, { target: 0, durationMs: 50 }));
    expect(getByTestId('value').textContent).toBe('0.00');

    act(() => {
      rerender(createElement(Probe, { target: 100, durationMs: 50 }));
    });

    await waitFor(
      () => {
        expect(getByTestId('value').textContent).toBe('100.00');
      },
      { timeout: 1000 },
    );
  });

  // Sprint 11.5 Priority-1 regression: a passively-producing resource changes its target
  // on essentially every game-loop tick, not in one discrete jump. The old implementation
  // kept `target` in its `useEffect` dependency array, so every target-changing render
  // cancelled the in-flight `requestAnimationFrame` and scheduled a brand new one — under
  // real, UNBOUNDED continuous ticking (the game loop never stops), no scheduled frame
  // ever survives long enough to fire, so the displayed value never advances even once.
  //
  // A convergence-after-the-fact test (change the target many times, then wait) does NOT
  // catch this: once the target STOPS changing, the last-scheduled frame survives and
  // converges normally regardless of what happened during the burst — tried this first,
  // found it passed against both the buggy and the fixed code (a real gap, caught before
  // trusting it), because a bounded test always eventually has that quiet moment the real,
  // never-ending game loop never provides.
  //
  // Testing the actual mechanism instead: the fix's effect deps are
  // `[reducedMotion, durationMs]` only, so `requestAnimationFrame` is called exactly once
  // per mount, never again just because `target` changed. The old code called it (net of
  // its own cancellation) once per target-changing render. Deterministic, no timing race.
  it('does not restart its animation frame on every target change (only on mount)', () => {
    useSettings.setState({ reducedMotion: false });
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    // useState(target) seeds `displayed` FROM `target`, so mount itself never has a gap
    // to animate — the old code's `if (delta === 0) return` (a correct, unrelated
    // optimization) means mount schedules 0 frames either way. The bug is entirely about
    // what happens on SUBSEQUENT target changes, so the baseline is taken after mount,
    // not compared across implementations.
    const { rerender } = render(createElement(Probe, { target: 5, durationMs: 50 }));
    const callsAfterMount = rafSpy.mock.calls.length;

    // Each rerender gets its OWN act() call (not one act() wrapping the whole loop) —
    // act() flushes that render's commit + effects before returning, so this forces 50
    // separate effect cycles, matching how the real game loop produces 50 separate
    // React commits (one per animation frame) rather than one batched update. Nothing
    // here ever yields to a real macrotask, so jsdom's rAF (a setTimeout polyfill) never
    // actually fires mid-loop either — same as the real bug, where the next tick's
    // commit always wins the race before the browser's next paint.
    for (let i = 1; i <= 50; i++) {
      act(() => {
        rerender(createElement(Probe, { target: 5 + i, durationMs: 50 }));
      });
    }

    // None of the 50 target changes above fire a rAF callback synchronously (jsdom never
    // auto-runs one without a real frame/fake-timer advance), so a per-target-change
    // restart would show up here as ~50 additional requestAnimationFrame calls (one per
    // changed target); a single persistent loop only schedules its NEXT frame from inside
    // its own already-running callback, which never got a chance to run in this
    // synchronous burst, so at most one new call (the fixed code's unconditional
    // mount-time schedule, captured above) should ever show up here — never a call per
    // target change.
    const newCallsFromTargetChanges = rafSpy.mock.calls.length - callsAfterMount;
    expect(newCallsFromTargetChanges).toBeLessThanOrEqual(1);
    rafSpy.mockRestore();
  });
});
