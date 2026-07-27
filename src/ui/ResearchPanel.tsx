import { useGameStore } from '../state/persistStore';
import { RESEARCH_TREE, type ResearchNode } from '../data/researchTree';
import { isNodeAvailable, isNodeVisible } from '../core/research';
import { progressFraction, remainingMs } from '../core/time';
import { formatDuration } from '../core/format';
import { useNow } from './useNow';
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
// re-render if its data didn't change) — isolated so the rest of the tree stays still.
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

function NodeCard({ node }: { node: ResearchNode }) {
  const completed = useGameStore((s) => s.research.completed);
  const inProgressProcess = useGameStore((s) => s.research.inProgress);
  const researchAmount = useGameStore((s) => s.resources.research.amount);
  const startResearchNode = useGameStore((s) => s.startResearchNode);

  if (!isNodeVisible(node, completed)) return null;

  const isDone = completed.includes(node.id);
  const isInProgress = inProgressProcess?.payload.nodeId === node.id;
  const isAvailable = !isDone && !isInProgress && isNodeAvailable(node, completed);
  const state = isDone ? 'done' : isInProgress ? 'in-progress' : isAvailable ? 'available' : 'locked';

  const canStart = isAvailable && !inProgressProcess && researchAmount >= node.costR;

  return (
    <div className={`research-node research-node--${state}`}>
      <div className="research-node__name">{node.name}</div>

      {state === 'locked' && (
        <div className="research-node__condition">Requires: {depNames(node)}</div>
      )}

      {state !== 'locked' && (
        <>
          <div className="research-node__cost">
            <CostLabel cost={{ research: node.costR }} />, {formatDuration(node.durationMs)}
          </div>
          {node.description && <div className="research-node__description">{node.description}</div>}
        </>
      )}

      {isInProgress && inProgressProcess && <ResearchRing process={inProgressProcess} />}

      {isAvailable && (
        <button
          type="button"
          className="upgrade-button"
          disabled={!canStart}
          onClick={() => startResearchNode(node.id)}
        >
          Start
        </button>
      )}

      {isDone && <div className="research-node__done">Done</div>}
    </div>
  );
}

export function ResearchPanel() {
  const inProgressProcess = useGameStore((s) => s.research.inProgress);

  return (
    <div className="research-panel">
      <div className="research-panel__header">
        {inProgressProcess ? (
          <ActiveResearchCountdown process={inProgressProcess} />
        ) : (
          <span className="research-panel__header--idle">No active research</span>
        )}
      </div>
      <div className="research-panel__branches">
        {BRANCHES.map((branch) => (
          <div key={branch} className="research-branch">
            <div className="research-branch__header">{BRANCH_LABELS[branch]}</div>
            {RESEARCH_TREE.filter((n) => n.branch === branch).map((node) => (
              <NodeCard key={node.id} node={node} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
