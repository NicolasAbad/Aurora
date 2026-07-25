import { describe, expect, it } from 'vitest';
import { exportTelemetry, trackEvent, trackFirstOccurrence } from './telemetry';

describe('trackEvent', () => {
  it('appends an event with a unique id, name, timestamp, and props', () => {
    const events = trackEvent([], 'first_pitch', { officesLevel: 1 }, 12345);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: 'first_pitch', timestamp: 12345, props: { officesLevel: 1 } });
    expect(events[0].id).toBeTruthy();
  });

  it('always appends, even for a repeated name', () => {
    let events = trackEvent([], 'pitch_clicked', {}, 1);
    events = trackEvent(events, 'pitch_clicked', {}, 2);
    expect(events).toHaveLength(2);
  });
});

describe('trackFirstOccurrence', () => {
  it('records an event the first time', () => {
    const events = trackFirstOccurrence([], 'first_hire', {}, 100);
    expect(events).toHaveLength(1);
  });

  it('is a no-op for a name already recorded (funnel steps count once)', () => {
    let events = trackFirstOccurrence([], 'first_hire', {}, 100);
    events = trackFirstOccurrence(events, 'first_hire', {}, 200);
    expect(events).toHaveLength(1);
    expect(events[0].timestamp).toBe(100); // the original, not overwritten
  });

  it('tracks different names independently', () => {
    let events = trackFirstOccurrence([], 'first_pitch', {}, 1);
    events = trackFirstOccurrence(events, 'first_hire', {}, 2);
    expect(events.map((e) => e.name)).toEqual(['first_pitch', 'first_hire']);
  });
});

describe('exportTelemetry', () => {
  it('serializes the buffer as readable JSON', () => {
    const events = trackEvent([], 'first_pitch', {}, 1);
    const json = exportTelemetry(events);
    expect(JSON.parse(json)).toEqual(events);
  });
});
