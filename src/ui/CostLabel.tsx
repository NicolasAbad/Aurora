import { formatAmount } from '../core/format';
import { RESOURCE_ICON, RESOURCE_NAME } from '../data/resourceNames';
import type { ResourceId } from '../core/types';

interface CostLabelProps {
  cost: Partial<Record<ResourceId, number>>;
  // ECONOMY §4 v3.6: a per-unit CONSUMPTION RATE (e.g. Fabrication's "Consumes: X per
  // Hardware") can now be fractional once a reduction upgrade applies (2 -> 1.7).
  // formatAmount's floor-to-integer is correct for one-time purchase COSTS (never
  // understate what you'll actually pay) but wrong here — flooring 0.9 to "0" reads as
  // free production, which it isn't. `precise` opts a consumer OUT of that floor and
  // into up-to-2-decimal display (trailing zeros stripped) for exactly this case.
  precise?: boolean;
}

function formatPreciseAmount(amount: number): string {
  return Number(amount.toFixed(2)).toString();
}

/**
 * UI_SPEC §4 (v3.0): costs render as icon + number, no resource noun ($ for Funding,
 * an icon for everything else) — and "every icon has a tooltip/long-press with the
 * resource's full name." A plain joined string (core/format.ts's formatCost) can't
 * carry a per-entry tooltip, so this is the one place every cost/price display in the
 * app renders from, keeping the tooltip requirement automatic rather than something
 * each consumer has to remember.
 */
export function CostLabel({ cost, precise = false }: CostLabelProps) {
  const entries = Object.entries(cost) as [ResourceId, number][];
  const fmt = precise ? formatPreciseAmount : formatAmount;
  return (
    <>
      {entries.map(([id, amount], i) => (
        <span key={id}>
          {i > 0 && ' + '}
          <span title={RESOURCE_NAME[id]}>
            {id === 'funding' ? `$${fmt(amount)}` : `${RESOURCE_ICON[id]} ${fmt(amount)}`}
          </span>
        </span>
      ))}
    </>
  );
}
