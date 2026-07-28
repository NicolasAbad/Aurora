import { describe, expect, it } from 'vitest';
import {
  describeCompletedCertification,
  describeCompletedProcess,
  describeCompletedResearch,
} from './processLabel';
import type { Process } from './types';

function makeProcess(overrides: Partial<Process>): Process {
  return { id: 'p1', kind: 'training', startedAt: 0, durationMs: 1000, payload: {}, ...overrides };
}

describe('describeCompletedProcess', () => {
  it('describes a promotion by role labels', () => {
    const p = makeProcess({ kind: 'training', payload: { from: 'technician', to: 'engineer' } });
    expect(describeCompletedProcess(p)).toBe('Promoted: Technician → Engineer');
  });

  it('describes a sounding-rocket assembly by name', () => {
    const p = makeProcess({ kind: 'integration', payload: { missionKind: 'sounding', rocketId: 's1' } });
    expect(describeCompletedProcess(p)).toContain('Assembled:');
  });

  it('describes an Aurora I stage by name', () => {
    const p = makeProcess({ kind: 'integration', payload: { missionKind: 'auroraI', stageId: 'structure' } });
    expect(describeCompletedProcess(p)).toMatch(/^Aurora I: .+ complete$/);
  });

  it('describes a sounding weather window generically', () => {
    const p = makeProcess({ kind: 'weather_window', payload: { missionKind: 'sounding' } });
    expect(describeCompletedProcess(p)).toBe('Weather window opened');
  });

  it('describes an Aurora I weather window distinctly from a sounding one', () => {
    const p = makeProcess({ kind: 'weather_window', payload: { missionKind: 'auroraI' } });
    expect(describeCompletedProcess(p)).toBe('Aurora I: weather window opened');
  });

  it('describes a pad transfer', () => {
    expect(describeCompletedProcess(makeProcess({ kind: 'transfer', payload: {} }))).toBe('Pad transfer complete');
  });
});

describe('describeCompletedResearch / describeCompletedCertification', () => {
  it('resolves a known research node id to its name', () => {
    expect(describeCompletedResearch('aluminum')).toBe('Research: Aluminum alloys');
  });

  it('falls back to the raw id for an unknown node', () => {
    expect(describeCompletedResearch('nonexistent')).toBe('Research: nonexistent');
  });

  it('resolves a known certification test id to its name', () => {
    expect(describeCompletedCertification('probe1Test1')).toContain('Certified:');
  });
});
