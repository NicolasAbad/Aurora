import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { RESEARCH_TREE, type ResearchNode } from '../data/researchTree';
import { narrativeText } from '../data/narrative';
import { buildingLevelsFor, canAffordCost } from '../core/actions';
import { isNodeAvailable, isNodeVisible } from '../core/research';
import { progressFraction, remainingMs } from '../core/time';
import { formatDuration } from '../core/format';
import { BUILDINGS } from '../data/buildings';
import { useNow } from './useNow';
import { AnimatedCheck } from './AnimatedCheck';
import { CostLabel } from './CostLabel';
import type { Process } from '../core/types';

const BRANCH_LABELS: Record<ResearchNode['branch'], string> = {
  materials: 'Materials',
  propulsion: 'Propulsion',
  operations: 'Operations',
  program: 'Program',
};

const BRANCHES: ResearchNode['branch'][] = ['materials', 'propulsion', 'operations', 'program'];

function depNames(node: ResearchNode): string {
  return node.deps.map((id) => RESEARCH_TREE.find((n) => n.id === id)?.name ?? id).join(', ');
}

// The only piece of this panel that needs a live-ticking clock (rule 10: a tile must not
// re-render if its data didn't change) — isolated so the tree itself stays still.
function ActiveResearchCountdown({ process }: { process: Process }) {
  const now = useNow();
  return (
    <span>
      Researching: {RESEARCH_TREE.find((n) => n.id === process.payload.nodeId)?.name} —{' '}
      {formatDuration(remainingMs(process, now))} remaining
    </span>
  );
}

function ResearchRing({ process }: { process: Process }) {
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

type NodeState = 'locked' | 'available' | 'in-progress' | 'done';

function useNodeState(node: ResearchNode): NodeState {
  const completed = useGameStore((s) => s.research.completed);
  const inProgressProcess = useGameStore((s) => s.research.inProgress);
  const secondInProgressProcess = useGameStore((s) => s.research.secondInProgress);
  const buildingLevels = useGameStore(useShallow((s) => buildingLevelsFor(s.buildings)));
  const isDone = completed.includes(node.id);
  // ECONOMY §4 v3.6: a node can be running in either slot once Second research track is owned.
  const isInProgress =
    inProgressProcess?.payload.nodeId === node.id || secondInProgressProcess?.payload.nodeId === node.id;
  const isAvailable = !isDone && !isInProgress && isNodeAvailable(node, completed, buildingLevels);
  return isDone ? 'done' : isInProgress ? 'in-progress' : isAvailable ? 'available' : 'locked';
}

/**
 * UI_SPEC §3 (v1.1 redesign): "small connected nodes — icon + name only, no inline
 * cost/duration/effect... states by fill." A compact status glyph stands in for the
 * "icon" (same ✓/○ vocabulary the checklist rows already use) since no per-topic icon
 * set exists anywhere else in this codebase (RESOURCE_ICON is the one precedent, and
 * it's scoped to resources, not research content) — full detail lives one tap away.
 */
function TreeNode({ node, selected, onSelect }: { node: ResearchNode; selected: boolean; onSelect: () => void }) {
  const completed = useGameStore((s) => s.research.completed);
  const buildingLevels = useGameStore(useShallow((s) => buildingLevelsFor(s.buildings)));
  const state = useNodeState(node);
  if (!isNodeVisible(node, completed, buildingLevels)) return null;

  return (
    <button
      type="button"
      className={`research-tree__node research-tree__node--${state}${selected ? ' research-tree__node--selected' : ''}`}
      onClick={onSelect}
    >
      <span className="research-tree__node-mark">
        {state === 'done' ? <AnimatedCheck /> : state === 'in-progress' ? '◐' : '○'}
      </span>
      <span className="research-tree__node-name">{node.name}</span>
    </button>
  );
}

function NodeDetail({ node, onClose }: { node: ResearchNode; onClose: () => void }) {
  const inProgressProcess = useGameStore((s) => s.research.inProgress);
  const secondInProgressProcess = useGameStore((s) => s.research.secondInProgress);
  const secondTrackUnlocked = useGameStore((s) => s.buildings.rndLab.upgrades.includes('secondResearchTrack'));
  const resources = useGameStore(useShallow((s) => s.resources));
  const buildingLevels = useGameStore(useShallow((s) => buildingLevelsFor(s.buildings)));
  const startResearchNode = useGameStore((s) => s.startResearchNode);
  const state = useNodeState(node);

  const isAvailable = state === 'available';
  // ECONOMY §4 v3.6: a slot is free if the primary is empty, or the second track is
  // owned and its own slot is empty — mirrors core/actions.ts's startResearch exactly.
  const hasFreeSlot = !inProgressProcess || (secondTrackUnlocked && !secondInProgressProcess);
  // ECONOMY §5b v4.1: full cost is Research + any secondaryCost — same merge
  // core/actions.ts's startResearch itself does, so this never drifts from what Start
  // actually charges.
  const fullCost = { research: node.costR, ...node.secondaryCost };
  const canStart = isAvailable && hasFreeSlot && canAffordCost(resources, fullCost);
  const activeProcess =
    inProgressProcess?.payload.nodeId === node.id
      ? inProgressProcess
      : secondInProgressProcess?.payload.nodeId === node.id
        ? secondInProgressProcess
        : null;
  // A node whose tech deps are all met but whose buildingDep isn't yet — the locked
  // reason is the missing building, not a dep chain (never a bare padlock, UI_SPEC §4).
  const missingBuilding =
    node.buildingDep && (buildingLevels[node.buildingDep] ?? 0) < 1 ? BUILDINGS[node.buildingDep].name : null;

  return (
    <div className="research-detail">
      <div className="research-detail__header">
        <span className="research-detail__name">{node.name}</span>
        <button type="button" className="research-detail__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {state === 'locked' && (
        <div className="research-node__condition">
          Requires: {[depNames(node), missingBuilding && `${missingBuilding} built`].filter(Boolean).join(', ')}
        </div>
      )}

      {state !== 'locked' && (
        <div className="research-node__cost">
          <CostLabel cost={fullCost} />, {formatDuration(node.durationMs)}
        </div>
      )}

      {/* UI_SPEC §4: "a node/upgrade with no mechanical effect says so explicitly" —
          NARRATIVE §8's own text already states the zero-effect ones plainly. */}
      <div className="research-node__description">{narrativeText(node.id)}</div>

      {state === 'in-progress' && activeProcess && <ResearchRing process={activeProcess} />}

      {isAvailable && (
        <button type="button" className="upgrade-button" disabled={!canStart} onClick={() => startResearchNode(node.id)}>
          Start
        </button>
      )}

      {state === 'done' && <div className="research-node__done">Done</div>}
    </div>
  );
}

export function ResearchPanel() {
  const inProgressProcess = useGameStore((s) => s.research.inProgress);
  const secondInProgressProcess = useGameStore((s) => s.research.secondInProgress);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode = selectedId ? RESEARCH_TREE.find((n) => n.id === selectedId) : undefined;

  return (
    <div className="research-panel">
      <div className="research-panel__header">
        {/* ECONOMY §4 v3.6: Second research track — both slots render independently
            when both are running, same "no process may exist without visible tracking"
            spirit as the active-process strip (UI_SPEC §2c). */}
        {inProgressProcess || secondInProgressProcess ? (
          <>
            {inProgressProcess && <div><ActiveResearchCountdown process={inProgressProcess} /></div>}
            {secondInProgressProcess && <div><ActiveResearchCountdown process={secondInProgressProcess} /></div>}
          </>
        ) : (
          <span className="research-panel__header--idle">No active research</span>
        )}
      </div>
      <div className="research-tree">
        <div className="research-tree__branches">
          {BRANCHES.map((branch) => (
            <div key={branch} className="research-branch">
              <div className="research-branch__header">{BRANCH_LABELS[branch]}</div>
              <div className="research-tree__chain">
                {RESEARCH_TREE.filter((n) => n.branch === branch).map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    selected={selectedId === node.id}
                    onSelect={() => setSelectedId(node.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {selectedNode && <NodeDetail node={selectedNode} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
}
