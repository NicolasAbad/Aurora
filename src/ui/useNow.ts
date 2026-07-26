import { useEffect, useState } from 'react';

/** A `now` that ticks every `intervalMs` (default 1s) — reading Date.now() directly
 * during render never triggers a re-render on its own, so a countdown display (research
 * timer, ProcessProgress) needs something that actually forces one. Scoped to just the
 * component that renders a live countdown, not the whole tree (rule 10: a tile must not
 * re-render if its data didn't change — this hook only lives where a countdown does). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
