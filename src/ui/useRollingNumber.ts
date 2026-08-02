import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../state/settings';

const DEFAULT_DURATION_MS = 400;

// Below this gap, snap to target instead of decaying forever — otherwise a
// continuously-ticking target never lets `delta` reach exactly 0. `formatAmount`
// (core/format.ts) floors rather than rounds, so approaching a discrete jump's target
// from below without ever fully snapping would under-report by 1 in the display
// indefinitely — 0.5 is generous enough to cross well within one `durationMs` (see the
// time-constant choice below) while still being visually inert at any resource's display
// precision (3 significant figures, ECONOMY §12).
const SNAP_EPSILON = 0.5;

/**
 * UI_SPEC §1: "rolling number animations" / §1b item 3. Eases the DISPLAYED value toward
 * `target` (requestAnimationFrame, exponential decay) rather than jumping straight to it
 * — since resources update essentially every tick, this reads as a continuous
 * smoothing/lag rather than discrete "count up then stop" animations, which is the
 * desired effect for a live-ticking value. Callers still run the result through the
 * existing `formatAmount`/`formatRate` — this hook only touches the raw number.
 * Reduced-motion: snaps straight to `target`, no RAF loop started at all.
 *
 * Sprint 11.5 Priority-1 fix (real bug, playtest-blocking): the original implementation
 * kicked off a fixed-duration 0->1 tween in a `useEffect` keyed on `[target, ...]`. Once
 * a resource has ANY passive production (e.g. one Technician staffing Finance), `target`
 * changes on literally every game-loop tick (~60/s) — far more often than one animation
 * frame — so the effect's cleanup cancelled the in-flight `requestAnimationFrame` before
 * its first callback ever ran, every single time. The eased position was always
 * recomputed at elapsed≈0 and never advanced: the displayed number froze at whatever it
 * was the instant continuous ticking began, even though the real value (and the
 * separately-computed rate) kept climbing normally underneath — store state was correct,
 * only the display was stuck. Sprint 1's store-level acceptance test couldn't catch this
 * (it never renders React at all); `useRollingNumber.test.ts` only exercised a single
 * discrete target change, never a rapidly/continuously-changing one.
 *
 * Fix: a single persistent rAF loop (restarted only on `reducedMotion`/`durationMs`
 * changes, never on `target`) that reads the LATEST target via a ref every frame and
 * exponentially decays the displayed value toward it — this tracks both a one-off
 * discrete jump (pitch click) and a continuously-moving target (passive production)
 * without ever being cancelled mid-flight by the next tick's re-render.
 */
export function useRollingNumber(target: number, durationMs = DEFAULT_DURATION_MS): number {
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const [displayed, setDisplayed] = useState(target);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (reducedMotion) {
      setDisplayed(targetRef.current);
      return;
    }
    // Reaches ~99.75% of any given gap within `durationMs` (exp(-6) ≈ 0.0025) — a
    // discrete jump (pitch click) should still fully settle around the stated duration,
    // same guarantee the old fixed-duration tween gave; a continuously-moving target
    // never reaches this point at all, it just keeps chasing every frame.
    const timeConstantMs = durationMs / 6;
    let raf = 0;
    let lastTime: number | null = null;
    function step(now: number) {
      const dt = lastTime === null ? 0 : now - lastTime;
      lastTime = now;
      setDisplayed((current) => {
        const delta = targetRef.current - current;
        if (Math.abs(delta) < SNAP_EPSILON) return targetRef.current;
        const decay = 1 - Math.exp(-dt / timeConstantMs);
        return current + delta * decay;
      });
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, durationMs]);

  return reducedMotion ? target : displayed;
}
