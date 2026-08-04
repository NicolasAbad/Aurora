import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { RESEARCH_TREE, repeatableNodeCost, type ResearchNode } from '../data/researchTree';
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

// ECONOMY §5c v4.3 (Sprint 11.6): 'excluded' (fork-locked, permanently, by a chosen
// sibling — never a bare padlock, UI_SPEC §4) and 'repeatable' (available again after
// its first purchase — never truly "done") are new alongside the original four.
type NodeState = 'locked' | 'excluded' | 'available' | 'in-progress' | 'done' | 'repeatable';

function useNodeState(node: ResearchNode): NodeState {
  const completed = useGameStore((s) => s.research.completed);
  const inProgressProcess = useGameStore((s) => s.research.inProgress);
  const secondInProgressProcess = useGameStore((s) => s.research.secondInProgress);
  const repeatablePurchases = useGameStore(useShallow((s) => s.research.repeatablePurchases ?? {}));
  const buildingLevels = useGameStore(useShallow((s) => buildingLevelsFor(s.buildings)));
  // ECONOMY §4 v3.6: a node can be running in either slot once Second research track is owned.
  const isInProgress =
    inProgressProcess?.payload.nodeId === node.id || secondInProgressProcess?.payload.nodeId === node.id;
  if (isInProgress) return 'in-progress';

  if (node.repeatable) {
    const purchases = repeatablePurchases[node.id] ?? 0;
    const available = isNodeAvailable(node, completed, buildingLevels, repeatablePurchases);
    if (available) return purchases > 0 ? 'repeatable' : 'available';
    return 'locked'; // deps not met yet, or (if maxPurchases is ever set) maxed out
  }

  const isDone = completed.includes(node.id);
  if (isDone) return 'done';
  if ((node.excludes ?? []).some((id) => completed.includes(id))) return 'excluded';
  const isAvailable = isNodeAvailable(node, completed, buildingLevels, repeatablePurchases);
  return isAvailable ? 'available' : 'locked';
}

// UI_SPEC §5c principle 6 / Sprint 11.6 task 3: fork/repeatable/mechanic-changing nodes
// render larger and more visually distinct than a plain percentage node in the lane
// layout — same "importance gets visual weight" system BuildingTile.tsx's own Current
// Directive hierarchy (task 2) established, applied here to node.visualWeight instead.
// Prefixed `--weight-` (not just `--${visualWeight}`) so it can never collide with a
// NodeState class of the same name — 'repeatable' is legitimately both a state (once
// purchased) and a visualWeight (always, for that node), and the two need to be
// stylable independently, not just coincidentally identical strings.
function visualWeightClass(node: ResearchNode): string {
  return node.visualWeight ? ` research-tree__node--weight-${node.visualWeight}` : '';
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
  const repeatablePurchases = useGameStore(useShallow((s) => s.research.repeatablePurchases ?? {}));
  const buildingLevels = useGameStore(useShallow((s) => buildingLevelsFor(s.buildings)));
  const state = useNodeState(node);
  if (!isNodeVisible(node, completed, buildingLevels, repeatablePurchases)) return null;

  const purchases = repeatablePurchases[node.id] ?? 0;

  return (
    <button
      type="button"
      className={`research-tree__node research-tree__node--${state}${visualWeightClass(node)}${selected ? ' research-tree__node--selected' : ''}`}
      onClick={onSelect}
    >
      <span className="research-tree__node-mark">
        {state === 'done' ? (
          <AnimatedCheck />
        ) : state === 'in-progress' ? (
          '◐'
        ) : state === 'excluded' ? (
          '✕'
        ) : state === 'repeatable' ? (
          purchases
        ) : (
          '○'
        )}
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
  const repeatablePurchases = useGameStore(useShallow((s) => s.research.repeatablePurchases ?? {}));
  const startResearchNode = useGameStore((s) => s.startResearchNode);
  const state = useNodeState(node);

  const isAvailable = state === 'available' || state === 'repeatable';
  // ECONOMY §4 v3.6: a slot is free if the primary is empty, or the second track is
  // owned and its own slot is empty — mirrors core/actions.ts's startResearch exactly.
  const hasFreeSlot = !inProgressProcess || (secondTrackUnlocked && !secondInProgressProcess);
  const purchases = repeatablePurchases[node.id] ?? 0;
  // ECONOMY §5b v4.1: full cost is Research + any secondaryCost — same merge
  // core/actions.ts's startResearch itself does, so this never drifts from what Start
  // actually charges. ECONOMY §5c v4.3 (Sprint 11.6): a repeatable node's cost instead
  // escalates by its own prior purchase count — same repeatableNodeCost helper
  // startResearch itself calls, so the preview here can never drift from what Start
  // actually charges either.
  const fullCost = node.repeatable ? repeatableNodeCost(node, purchases) : { research: node.costR, ...node.secondaryCost };
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
  // ECONOMY §5c v4.3: the sibling that permanently excluded this node, if any — "never a
  // bare padlock" applies just as much to a fork exclusion as to an unmet dependency.
  const excludedBy = state === 'excluded' ? RESEARCH_TREE.find((n) => n.excludes?.includes(node.id)) : undefined;

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

      {state === 'excluded' && (
        <div className="research-node__condition">
          Permanently unavailable — you chose {excludedBy?.name ?? 'a mutually exclusive path'} instead. This choice
          cannot be undone for this program.
        </div>
      )}

      {state === 'repeatable' && (
        <div className="research-node__condition">Purchased {purchases}× so far. Cost rises with each purchase.</div>
      )}

      {(state === 'available' || state === 'repeatable' || state === 'in-progress') && (
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
          {state === 'repeatable' ? 'Buy again' : 'Start'}
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
