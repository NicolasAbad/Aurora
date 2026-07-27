import { formatAmount } from '../core/format';
import { RESOURCE_ICON, RESOURCE_NAME } from '../data/resourceNames';
import type { ResourceId } from '../core/types';

interface CostLabelProps {
  cost: Partial<Record<ResourceId, number>>;
}

/**
 * UI_SPEC §4 (v3.0): costs render as icon + number, no resource noun ($ for Funding,
 * an icon for everything else) — and "every icon has a tooltip/long-press with the
 * resource's full name." A plain joined string (core/format.ts's formatCost) can't
 * carry a per-entry tooltip, so this is the one place every cost/price display in the
 * app renders from, keeping the tooltip requirement automatic rather than something
 * each consumer has to remember.
 */
export function CostLabel({ cost }: CostLabelProps) {
  const entries = Object.entries(cost) as [ResourceId, number][];
  return (
    <>
      {entries.map(([id, amount], i) => (
        <span key={id}>
          {i > 0 && ' + '}
          <span title={RESOURCE_NAME[id]}>
            {id === 'funding' ? `$${formatAmount(amount)}` : `${RESOURCE_ICON[id]} ${formatAmount(amount)}`}
          </span>
        </span>
      ))}
    </>
  );
}
