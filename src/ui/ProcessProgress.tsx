import { progressFraction, remainingMs } from '../core/time';
import type { Process } from '../core/types';

// UI_SPEC §4: "Every timer shows remaining time in human units (2h 14m, 45s)."
function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

interface ProcessProgressProps {
  process: Process;
  // Passed in rather than read via Date.now() internally, to keep this a pure,
  // easily-testable presentational component. No building tile has a real process to
  // attach this to yet (research/certification/etc. land Sprint 4+) — built now per
  // SPRINTS.md Sprint 2 task 4, ready for those sprints to wire in; whichever screen
  // uses it first owns deciding how `now` gets refreshed (e.g. a ticking interval).
  now: number;
}

export function ProcessProgress({ process, now }: ProcessProgressProps) {
  const fraction = progressFraction(process, now);
  const remaining = remainingMs(process, now);

  return (
    <div className="process-progress">
      <div className="process-progress__bar">
        <div className="process-progress__fill" style={{ width: `${fraction * 100}%` }} />
      </div>
      <span className="process-progress__remaining">{formatRemaining(remaining)}</span>
    </div>
  );
}
