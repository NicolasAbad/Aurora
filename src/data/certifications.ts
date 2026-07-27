// ECONOMY_MODEL.md §6 (v2.5 values). v1 only defines Probe-1's three tests — Orbital-1
// (Aurora I) is Sprint 7 scope (a single probabilistic base test, not this first/retry
// shape), added to this table when that sprint builds it.
import type { EngineId } from '../core/types';

const MIN = 60_000;

export interface CertificationTestDef {
  id: string;
  engineId: EngineId;
  name: string;
  // 'first': the engine's first-ever base-cert attempt (Probe-1: scripted, guaranteed
  // failure). 'retry': a subsequent base-cert attempt (Probe-1: guaranteed success —
  // "test 2"). 'extended': optional, only once already certified, no reward of its own —
  // it only raises the Confidence term used at launch (core/confidence.ts, Sprint 7).
  stage: 'first' | 'retry' | 'extended';
  consumes: { hardware: number; propellant: number };
  durationMs: number;
  // UI_SPEC §4 (v3.3): effect disclosure is scoped to player CHOICES. Test 1 is
  // GDD §7's designed first failure, not a choice — it deliberately has NO description
  // here (absent, not just unrendered — same "genuinely absent" pattern as the removed
  // [v2] upgrades), so there is nothing for the UI to preview beyond cost/duration.
  // Test 2 and extended are real choices (worth doing? worth doing now?) and get one.
  description?: string;
}

export const CERTIFICATION_TESTS: CertificationTestDef[] = [
  {
    id: 'probe1Test1',
    engineId: 'probe1',
    name: 'Probe-1 static fire, test 1',
    stage: 'first',
    consumes: { hardware: 10, propellant: 50 },
    durationMs: 25 * MIN,
    // No description (see field comment) — UI_SPEC §4's carve-out for this exact test.
  },
  {
    id: 'probe1Test2',
    engineId: 'probe1',
    name: 'Probe-1 static fire, test 2',
    stage: 'retry',
    consumes: { hardware: 8, propellant: 50 },
    durationMs: 25 * MIN,
    description: 'Guaranteed success. Certifies Probe-1 — the engine that powers the S-1 and S-2 sounding rockets.',
  },
  {
    id: 'probe1Extended',
    engineId: 'probe1',
    name: 'Probe-1 extended certification',
    stage: 'extended',
    consumes: { hardware: 8, propellant: 50 },
    durationMs: 25 * MIN,
    description: 'Optional. +30 Launch Confidence instead of +20, once certified.',
  },
];

export const CERTIFICATION_TESTS_BY_ID: Map<string, CertificationTestDef> = new Map(
  CERTIFICATION_TESTS.map((t) => [t.id, t]),
);
