// UI_SPEC §3 Design B (Sprint 9.5's Research tab redesign) reused verbatim for the
// Flight Experience tree — same "4 horizontal branch lanes, tap a node for detail"
// shape (ECONOMY §9 has 4 branches too), judgment call documented in PROGRESS.md rather
// than a UI_SPEC section of its own (no design gap here: the layout is a direct reuse of
// an owner-approved pattern, not a new decision).
import { useState } from 'react';
import { useGameStore } from '../state/persistStore';
import { DEFAULT_FLIGHT_XP_TREE_STATE, isXpNodeAvailable, isXpNodeVisible, XP_NODES_PENDING_DESIGN } from '../core/flightXp';
import { XP_TREE, type XpNode } from '../data/flightXpTree';
import { narrativeText } from '../data/narrative';
import { AnimatedCheck } from './AnimatedCheck';
import { CostLabel } from './CostLabel';

const BRANCH_LABELS: Record<XpNode['branch'], string> = {
  propulsion: 'Propulsion',
  operations: 'Operations',
  organization: 'Organization',
  prestige: 'Prestige',
};

const BRANCHES: XpNode['branch'][] = ['propulsion', 'operations', 'organization', 'prestige'];

function depNames(node: XpNode): string {
  return node.deps.map((id) => XP_TREE.find((n) => n.id === id)?.name ?? id).join(', ');
}

type NodeState = 'locked' | 'available' | 'done' | 'pending-design';

function nodeState(node: XpNode, purchased: string[]): NodeState {
  if (purchased.includes(node.id)) return 'done';
  if (XP_NODES_PENDING_DESIGN.includes(node.id)) return 'pending-design';
  return isXpNodeAvailable(node, purchased) ? 'available' : 'locked';
}

function TreeNode({ node, purchased, selected, onSelect }: { node: XpNode; purchased: string[]; selected: boolean; onSelect: () => void }) {
  if (!isXpNodeVisible(node, purchased)) return null;
  const state = nodeState(node, purchased);
  // UI_SPEC §1d (Sprint 11.6 task 5, anti-slop re-audit): this panel reuses the exact
  // same .research-tree__node styling as ResearchPanel — the "uniform cards regardless
  // of importance" pattern task 1/3 fixed there was equally present here, since
  // `mechanicChange` (GDD §9's own "changes a mechanic, not just a percentage" flag,
  // already on the data — Partial reusability, Parallel integration) was never wired to
  // any visual treatment. Reuses the SAME --weight-mechanic class ResearchPanel's own
  // mechanic-changing nodes use — no new CSS needed, one consistent visual language.
  const weightClass = node.mechanicChange ? ' research-tree__node--weight-mechanic' : '';

  return (
    <button
      type="button"
      className={`research-tree__node research-tree__node--${state === 'pending-design' ? 'locked' : state}${weightClass}${selected ? ' research-tree__node--selected' : ''}`}
      onClick={onSelect}
    >
      <span className="research-tree__node-mark">{state === 'done' ? <AnimatedCheck /> : '○'}</span>
      <span className="research-tree__node-name">{node.name}</span>
    </button>
  );
}

function NodeDetail({ node, onClose }: { node: XpNode; onClose: () => void }) {
  const purchased = useGameStore((s) => s.flightXpTree?.purchased ?? DEFAULT_FLIGHT_XP_TREE_STATE.purchased);
  const flightXpAmount = useGameStore((s) => s.resources.flightxp.amount);
  const buyFlightXpNode = useGameStore((s) => s.buyFlightXpNode);
  const state = nodeState(node, purchased);
  const canBuy = state === 'available' && flightXpAmount >= node.costXp;

  return (
    <div className="research-detail">
      <div className="research-detail__header">
        <span className="research-detail__name">{node.name}</span>
        <button type="button" className="research-detail__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {state === 'locked' && <div className="research-node__condition">Requires: {depNames(node)}</div>}

      {state !== 'locked' && (
        <div className="research-node__cost">
          <CostLabel cost={{ flightxp: node.costXp }} />
        </div>
      )}

      {/* UI_SPEC §4: every purchasable states its effect (NARRATIVE §12). */}
      <div className="research-node__description">{narrativeText(node.id)}</div>

      {(state === 'available' || state === 'pending-design') && (
        <button
          type="button"
          className="upgrade-button"
          disabled={state === 'pending-design' || !canBuy}
          onClick={() => buyFlightXpNode(node.id)}
        >
          {state === 'pending-design' ? 'Coming soon' : 'Buy'}
        </button>
      )}

      {state === 'done' && <div className="research-node__done">Done</div>}
    </div>
  );
}

export function FlightXpPanel() {
  const purchased = useGameStore((s) => s.flightXpTree?.purchased ?? DEFAULT_FLIGHT_XP_TREE_STATE.purchased);
  const flightXpAmount = useGameStore((s) => s.resources.flightxp.amount);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode = selectedId ? XP_TREE.find((n) => n.id === selectedId) : undefined;

  return (
    <div className="research-panel">
      <div className="research-panel__header">
        <span>Flight Experience: {flightXpAmount.toFixed(0)}</span>
      </div>
      <div className="research-tree">
        <div className="research-tree__branches">
          {BRANCHES.map((branch) => (
            <div key={branch} className="research-branch">
              <div className="research-branch__header">{BRANCH_LABELS[branch]}</div>
              <div className="research-tree__chain">
                {XP_TREE.filter((n) => n.branch === branch).map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    purchased={purchased}
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
