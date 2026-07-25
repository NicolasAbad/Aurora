// Telemetry middleware (SPRINTS.md Sprint 2 task 5): FTUE funnel events to a local
// buffer. CLAUDE.md rule 11 — always local-first; a remote endpoint is Sprint 12's
// decision, not built here. Pure functions (no Zustand/React import) so they're testable
// without a store, even though this lives in state/ rather than core/ per the doc's
// named path — it's app-instrumentation plumbing, not game economy/time logic.
import type { TelemetryEvent } from '../core/types';

export function trackEvent(
  events: TelemetryEvent[],
  name: string,
  props: Record<string, unknown> = {},
  timestamp: number = Date.now(),
): TelemetryEvent[] {
  const id = `${name}-${timestamp}-${events.length}`;
  return [...events, { id, name, timestamp, props }];
}

/** FTUE funnel events (GDD §11) are recorded once per game — first occurrence only,
 * so the buffer measures "did the player reach this step," not click counts. */
export function trackFirstOccurrence(
  events: TelemetryEvent[],
  name: string,
  props?: Record<string, unknown>,
  timestamp?: number,
): TelemetryEvent[] {
  if (events.some((e) => e.name === name)) return events;
  return trackEvent(events, name, props, timestamp);
}

/** Local-first export — Sprint 8's Settings screen wires this to a download/copy button. */
export function exportTelemetry(events: TelemetryEvent[]): string {
  return JSON.stringify(events, null, 2);
}
