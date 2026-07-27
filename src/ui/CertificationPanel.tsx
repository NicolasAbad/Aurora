import { useGameStore } from '../state/persistStore';
import { CERTIFICATION_TESTS, CERTIFICATION_TESTS_BY_ID, type CertificationTestDef } from '../data/certifications';
import { isCertificationTestAvailable } from '../core/certification';
import { progressFraction, remainingMs } from '../core/time';
import { formatDuration } from '../core/format';
import { CostLabel } from './CostLabel';
import { useNow } from './useNow';
import type { EngineCertificationState, Process } from '../core/types';

// The only piece of this panel that needs a live-ticking clock (rule 10), same pattern
// as ResearchPanel's ActiveResearchCountdown.
function ActiveCertificationCountdown({ process }: { process: Process }) {
  const now = useNow();
  const test = CERTIFICATION_TESTS_BY_ID.get(process.payload.testId as string);
  return (
    <span>
      Testing: {test?.name} — {formatDuration(remainingMs(process, now))} remaining
    </span>
  );
}

function CertificationRing({ process }: { process: Process }) {
  const now = useNow();
  return (
    <div
      className="research-node__ring"
      style={{ '--fraction': progressFraction(process, now) } as React.CSSProperties}
    >
      <span>{formatDuration(remainingMs(process, now))}</span>
    </div>
  );
}

// UI_SPEC §4 (v3.3): only 'retry' and 'extended' locked states need condition text —
// 'first' is always immediately available for an untested engine, never locked.
function lockedCondition(test: CertificationTestDef): string {
  if (test.stage === 'extended') return 'Requires: certified';
  return 'Requires: first attempt resolved';
}

function isDone(test: CertificationTestDef, engineState: EngineCertificationState): boolean {
  if (test.stage === 'extended') return engineState.extendedCertified;
  if (test.stage === 'retry') return engineState.certified;
  return engineState.attempted; // 'first'
}

function CertificationCard({ test }: { test: CertificationTestDef }) {
  const engineState = useGameStore((s) => s.certifications.engines[test.engineId]);
  const inProgressProcess = useGameStore((s) => s.certifications.inProgress);
  const startCertificationTest = useGameStore((s) => s.startCertificationTest);
  const resources = useGameStore((s) => s.resources);

  const done = isDone(test, engineState);
  const isInProgress = inProgressProcess?.payload.testId === test.id;
  const available = !done && !isInProgress && isCertificationTestAvailable(test, engineState);
  const state = done ? 'done' : isInProgress ? 'in-progress' : available ? 'available' : 'locked';

  const canAfford = resources.hardware.amount >= test.consumes.hardware && resources.propellant.amount >= test.consumes.propellant;
  const canStart = available && !inProgressProcess && canAfford;

  return (
    <div className={`research-node research-node--${state}`}>
      <div className="research-node__name">{test.name}</div>

      {state === 'locked' && <div className="research-node__condition">{lockedCondition(test)}</div>}

      {state !== 'locked' && (
        <>
          <div className="research-node__cost">
            <CostLabel cost={test.consumes} />, {formatDuration(test.durationMs)}
          </div>
          {/* UI_SPEC §4 (v3.3): test 1 has no `description` at all (data-level carve-out
              for GDD §7's designed first failure) — this simply renders nothing for it. */}
          {test.description && <div className="research-node__description">{test.description}</div>}
        </>
      )}

      {isInProgress && inProgressProcess && <CertificationRing process={inProgressProcess} />}

      {available && (
        <button
          type="button"
          className="upgrade-button"
          disabled={!canStart}
          onClick={() => startCertificationTest(test.id)}
        >
          Start
        </button>
      )}

      {done && <div className="research-node__done">Done</div>}
    </div>
  );
}

/** ECONOMY §6 / SPRINTS Sprint 5: certification tests, shown once the Test Stand is
 * built. v1 only has Probe-1 content (Orbital-1 is Sprint 7) — grouping by engine here
 * is future-proofing for when a second engine's tests exist, not speculative UI now. */
export function CertificationPanel() {
  const inProgressProcess = useGameStore((s) => s.certifications.inProgress);

  return (
    <div className="research-panel">
      <div className="research-panel__header">
        {inProgressProcess ? (
          <ActiveCertificationCountdown process={inProgressProcess} />
        ) : (
          <span className="research-panel__header--idle">No active certification</span>
        )}
      </div>
      <div className="research-branch">
        <div className="research-branch__header">Probe-1 engine</div>
        {CERTIFICATION_TESTS.filter((t) => t.engineId === 'probe1').map((test) => (
          <CertificationCard key={test.id} test={test} />
        ))}
      </div>
    </div>
  );
}
