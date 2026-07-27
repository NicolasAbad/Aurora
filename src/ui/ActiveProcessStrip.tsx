import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { RESEARCH_BY_ID } from '../data/researchTree';
import { CERTIFICATION_TESTS_BY_ID } from '../data/certifications';
import { ROLE_LABEL } from '../data/roles';
import { SOUNDING_ROCKETS } from '../data/soundingRockets';
import { AURORA_I_STAGES_BY_ID } from '../data/auroraI';
import { remainingMs } from '../core/time';
import { useNow } from './useNow';
import { ProcessProgress } from './ProcessProgress';
import type { ComplexId, Process, RoleId } from '../core/types';

interface Chip {
  id: string;
  label: string;
  process: Process;
  complex: ComplexId;
}

const MAX_VISIBLE = 4;

/**
 * UI_SPEC §2c: "No process may exist without a chip." Gathers every in-flight process
 * across the three places they currently live (research's dedicated slot, certification's
 * dedicated slot, and the generic `processes` array — training/promotion today, more
 * kinds as later sprints add them) into one flat list. This is what makes a promotion
 * trackable at all right now — nothing else in the UI shows its progress.
 */
function useActiveChips(): Chip[] {
  const researchInProgress = useGameStore((s) => s.research.inProgress);
  const certInProgress = useGameStore((s) => s.certifications.inProgress);
  const processes = useGameStore(useShallow((s) => s.processes));

  const chips: Chip[] = [];

  if (researchInProgress) {
    const node = RESEARCH_BY_ID.get(researchInProgress.payload.nodeId as string);
    chips.push({
      id: researchInProgress.id,
      label: `Researching: ${node?.name ?? researchInProgress.payload.nodeId}`,
      process: researchInProgress,
      complex: 'campus',
    });
  }

  if (certInProgress) {
    const test = CERTIFICATION_TESTS_BY_ID.get(certInProgress.payload.testId as string);
    chips.push({
      id: certInProgress.id,
      label: `Certifying: ${test?.name ?? certInProgress.payload.testId}`,
      process: certInProgress,
      complex: 'testing',
    });
  }

  for (const p of processes) {
    if (p.kind === 'training') {
      const { from, to } = p.payload as { from: RoleId; to: RoleId };
      chips.push({
        id: p.id,
        label: `Promoting: ${ROLE_LABEL[from]} → ${ROLE_LABEL[to]}`,
        process: p,
        complex: 'campus',
      });
    }
    if (p.kind === 'integration' && p.payload.missionKind === 'sounding') {
      const rocket = SOUNDING_ROCKETS[p.payload.rocketId as 's1' | 's2'];
      chips.push({ id: p.id, label: `Assembling: ${rocket.name}`, process: p, complex: 'testing' });
    }
    if (p.kind === 'weather_window' && p.payload.missionKind === 'sounding') {
      chips.push({ id: p.id, label: 'Weather window', process: p, complex: 'testing' });
    }
    if (p.kind === 'integration' && p.payload.missionKind === 'auroraI') {
      const stage = AURORA_I_STAGES_BY_ID.get(p.payload.stageId as never);
      chips.push({ id: p.id, label: `Aurora I: ${stage?.name ?? p.payload.stageId}`, process: p, complex: 'launch' });
    }
    if (p.kind === 'weather_window' && p.payload.missionKind === 'auroraI') {
      chips.push({ id: p.id, label: 'Aurora I: Weather window', process: p, complex: 'launch' });
    }
    // Remaining kinds (transfer, contract_build) have no current UI consumer — added
    // here the same sprint that gives them a real payload, same "infra only where
    // content exists" restraint as everywhere else in this codebase.
  }

  return chips;
}

function ChipButton({ chip, now, onSelect }: { chip: Chip; now: number; onSelect: (c: ComplexId) => void }) {
  return (
    <button type="button" className="process-strip__chip" onClick={() => onSelect(chip.complex)}>
      <span className="process-strip__label">{chip.label}</span>
      <ProcessProgress process={chip.process} now={now} />
    </button>
  );
}

interface ActiveProcessStripProps {
  onSelectComplex: (id: ComplexId) => void;
}

export function ActiveProcessStrip({ onSelectComplex }: ActiveProcessStripProps) {
  const now = useNow();
  const chips = useActiveChips();
  const [expanded, setExpanded] = useState(false);

  if (chips.length === 0) return null; // UI_SPEC §2c: collapses to zero height when empty

  const sorted = [...chips].sort((a, b) => remainingMs(a.process, now) - remainingMs(b.process, now));
  const visible = sorted.slice(0, MAX_VISIBLE);
  const overflow = sorted.slice(MAX_VISIBLE);

  return (
    <div className="process-strip">
      {visible.map((chip) => (
        <ChipButton key={chip.id} chip={chip} now={now} onSelect={onSelectComplex} />
      ))}
      {overflow.length > 0 && (
        <>
          <button type="button" className="process-strip__overflow" onClick={() => setExpanded((e) => !e)}>
            +{overflow.length}
          </button>
          {expanded && overflow.map((chip) => (
            <ChipButton key={chip.id} chip={chip} now={now} onSelect={onSelectComplex} />
          ))}
        </>
      )}
    </div>
  );
}
