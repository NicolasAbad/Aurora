// ECONOMY_MODEL.md §6 (v2.5 values). Probe-1's three tests are all deterministic
// (scripted failure / guaranteed success / guaranteed extended). Orbital-1 (Sprint 7) is
// genuinely probabilistic (80% success) for both its first attempt and any retry —
// modeled with the SAME 'first'/'retry' stage split (availability logic already fits:
// 'retry' = attempted-but-not-certified, exactly Orbital-1's post-failure state too),
// distinguished from Probe-1's deterministic tests by the new `successRate` field below.
import type { EngineId } from '../core/types';

const MIN = 60_000;
const HOUR = 60 * MIN;

export interface CertificationTestDef {
  id: string;
  engineId: EngineId;
  name: string;
  // 'first': the engine's first-ever base-cert attempt. 'retry': a subsequent base-cert
  // attempt (Probe-1: guaranteed success — "test 2"; Orbital-1: another 80% roll, at
  // half the duration, ECONOMY §6). 'extended': optional, only once already certified,
  // no reward of its own — it only raises the Confidence term used at launch
  // (core/confidence.ts).
  stage: 'first' | 'retry' | 'extended';
  consumes: { hardware: number; propellant: number };
  durationMs: number;
  // Present only for a genuinely probabilistic test (Orbital-1's 'first'/'retry') —
  // absent means deterministic, dispatched by `stage` alone (core/certification.ts).
  // Rule 12: the roll is drawn once, at process START (core/actions.ts's
  // startCertification), stored in the process payload, and never redrawn at
  // resolution — same anti-save-scum guarantee as the launch checklist's committedRoll.
  successRate?: number;
  // UI_SPEC §4 (v3.3): effect disclosure is scoped to player CHOICES. Probe-1 test 1 is
  // GDD §7's designed first failure, not a choice — it deliberately has NO description
  // here (absent, not just unrendered — same "genuinely absent" pattern as the removed
  // [v2] upgrades), so there is nothing for the UI to preview beyond cost/duration.
  // Every other test (including Orbital-1's, which is a real choice with a known,
  // disclosable success rate) is a real choice and gets one.
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
  {
    id: 'orbital1Base',
    engineId: 'orbital1',
    name: 'Orbital-1 certification',
    stage: 'first',
    consumes: { hardware: 25, propellant: 150 },
    durationMs: 3 * HOUR,
    successRate: 0.8,
    description: '80% chance of success. Certifies Orbital-1 — the engine that powers Aurora I.',
  },
  {
    id: 'orbital1Retry',
    engineId: 'orbital1',
    name: 'Orbital-1 certification (retry)',
    stage: 'retry',
    consumes: { hardware: 25, propellant: 150 },
    durationMs: 1.5 * HOUR,
    successRate: 0.8,
    description: '80% chance of success, at half the usual duration.',
  },
  {
    id: 'orbital1Extended',
    engineId: 'orbital1',
    name: 'Orbital-1 extended certification',
    stage: 'extended',
    consumes: { hardware: 20, propellant: 120 },
    durationMs: 2 * HOUR,
    description: 'Optional. +30 Launch Confidence instead of +20, once certified.',
  },
];

export const CERTIFICATION_TESTS_BY_ID: Map<string, CertificationTestDef> = new Map(
  CERTIFICATION_TESTS.map((t) => [t.id, t]),
);
