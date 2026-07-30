import { formatDuration } from '../core/format';
import { remainingMs } from '../core/time';
import { useNow } from './useNow';
import type { Process } from '../core/types';

/**
 * UI_SPEC screen 4 (Sprint 10.5, Visual Identity 2.0, cheap win): the "optimal weather
 * window" checklist item shows a small animated radar-sweep — a rotating line on a
 * circular scope, blueprint style — instead of a bare countdown ring. Same remaining-time
 * text as the ring it replaces; the sweep itself is a continuous decorative scan (not
 * tied to the actual progress fraction, same as a real radar sweep loops regardless of
 * what it's scanning for). Generic over `process` so both LaunchSequencePanel (Aurora/
 * contract pads) and SoundingMissionPanel (sounding rockets) can share one component —
 * same "reusable, not hardcoded to one call site" precedent as RocketBlueprint.
 */
export function WeatherRadarSweep({ process }: { process: Process }) {
  const now = useNow();
  return (
    <div className="weather-radar">
      <svg viewBox="0 0 40 40" className="weather-radar__scope" aria-hidden="true">
        <circle className="weather-radar__ring" cx="20" cy="20" r="17" />
        <circle className="weather-radar__ring" cx="20" cy="20" r="11" />
        <circle className="weather-radar__ring" cx="20" cy="20" r="5" />
        <line className="weather-radar__crosshair" x1="20" y1="3" x2="20" y2="37" />
        <line className="weather-radar__crosshair" x1="3" y1="20" x2="37" y2="20" />
        <line className="weather-radar__sweep" x1="20" y1="20" x2="20" y2="3" />
      </svg>
      <span className="weather-radar__time">{formatDuration(remainingMs(process, now))}</span>
    </div>
  );
}
