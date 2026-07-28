// SPRINTS.md Sprint 8, task 3: "polished 'While you were away'." Past-tense summary
// labels for processes that finished during an offline gap — factual/mechanical text
// (a status readout, same category as BuildingTile's `description` field or
// ActiveProcessStrip's present-tense chip labels), not narrative prose, so this is
// built the same way those already are rather than routed through NARRATIVE_EVENTS.md
// (rule 9 governs player-facing STORY text; "Research: Aluminum alloys" is a log line).
// Deliberately separate from ActiveProcessStrip's own (present-tense, "Researching:")
// labeling rather than sharing it — different tense, different UI, no shared call site.
import { RESEARCH_BY_ID } from '../data/researchTree';
import { CERTIFICATION_TESTS_BY_ID } from '../data/certifications';
import { SOUNDING_ROCKETS } from '../data/soundingRockets';
import { AURORA_I_STAGES_BY_ID } from '../data/auroraI';
import { ROLE_LABEL } from '../data/roles';
import type { Process, RoleId } from './types';

/** Research/certification completions aren't in this list — they live in their own
 * dedicated GameState slots (research.inProgress/secondInProgress,
 * certifications.inProgress), resolved separately (resolveResearch/resolveCertification),
 * and are described by their own call sites in state/persistStore.ts's away-summary
 * computation, which already has their justCompleted/justCompletedIds signals to hand. */
export function describeCompletedProcess(process: Process): string {
  switch (process.kind) {
    case 'training': {
      const { from, to } = process.payload as { from: RoleId; to: RoleId };
      return `Promoted: ${ROLE_LABEL[from]} → ${ROLE_LABEL[to]}`;
    }
    case 'integration': {
      if (process.payload.missionKind === 'sounding') {
        const rocket = SOUNDING_ROCKETS[process.payload.rocketId as 's1' | 's2'];
        return `Assembled: ${rocket.name}`;
      }
      if (process.payload.missionKind === 'auroraI') {
        const stage = AURORA_I_STAGES_BY_ID.get(process.payload.stageId as never);
        return `Aurora I: ${stage?.name ?? process.payload.stageId} complete`;
      }
      return 'Integration complete';
    }
    case 'weather_window':
      return process.payload.missionKind === 'auroraI'
        ? 'Aurora I: weather window opened'
        : 'Weather window opened';
    case 'transfer':
      return 'Pad transfer complete';
    case 'contract_build':
      return 'Contract payload built';
    case 'research':
    case 'certification':
      // Unreachable via offline.completedProcesses (see header note) — listed for
      // switch exhaustiveness only.
      return 'Process complete';
  }
}

export function describeCompletedResearch(nodeId: string): string {
  const node = RESEARCH_BY_ID.get(nodeId);
  return `Research: ${node?.name ?? nodeId}`;
}

export function describeCompletedCertification(testId: string): string {
  const test = CERTIFICATION_TESTS_BY_ID.get(testId);
  return `Certified: ${test?.name ?? testId}`;
}
