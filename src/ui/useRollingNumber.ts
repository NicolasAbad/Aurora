import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../state/settings';

const DEFAULT_DURATION_MS = 400;

/**
 * UI_SPEC §1: "rolling number animations" / §1b item 3. Eases the DISPLAYED value toward
 * `target` over `durationMs` (requestAnimationFrame, ease-out) rather than jumping
 * straight to it — since resources update essentially every tick, this reads as a
 * continuous smoothing/lag rather than discrete "count up then stop" animations, which is
 * the desired effect for a live-ticking value. Callers still run the result through the
 * existing `formatAmount`/`formatRate` — this hook only touches the raw number.
 * Reduced-motion: snaps straight to `target`, no RAF loop started at all.
 */
export function useRollingNumber(target: number, durationMs = DEFAULT_DURATION_MS): number {
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const [displayed, setDisplayed] = useState(target);
  const displayedRef = useRef(target);
  displayedRef.current = displayed;

  useEffect(() => {
    if (reducedMotion) {
      if (displayedRef.current !== target) setDisplayed(target);
      return;
    }
    const from = displayedRef.current;
    const delta = target - from;
    if (delta === 0) return;

    let raf = 0;
    let start: number | null = null;
    function step(now: number) {
      if (start === null) start = now;
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - (1 - t) * (1 - t); // ease-out quad
      setDisplayed(from + delta * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reducedMotion, durationMs]);

  return reducedMotion ? target : displayed;
}
