import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { formatAmount, formatRate } from '../core/format';
import { getResourceRatePerSecond } from '../core/selectors';
import type { ResourceId } from '../core/types';

const PRIMARY: { id: ResourceId; label: string }[] = [
  { id: 'funding', label: 'Funding' },
  { id: 'materials', label: 'Materials' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'propellant', label: 'Propellant' },
];

const SECONDARY: { id: ResourceId; label: string }[] = [
  { id: 'research', label: 'Research' },
  { id: 'reputation', label: 'Reputation' },
  { id: 'flightxp', label: 'Flight XP' },
];

// UI_SPEC §2b: "Ticker starts with Funding only; each resource row appears the first
// time the player gains (or can produce) that resource." Funding is the one row shown
// unconditionally (GDD §11: the player starts with one resource); everything else
// reveals itself once lifetimeEarned > 0 — the full 7-resource ticker is itself a
// progression artifact, not the default view.
function isRevealed(id: ResourceId, resources: Record<ResourceId, { lifetimeEarned: number }>) {
  return id === 'funding' || resources[id].lifetimeEarned > 0;
}

export function Ticker() {
  const resources = useGameStore(useShallow((s) => s.resources));
  const production = useGameStore(
    useShallow((s) => ({ buildings: s.buildings, staff: s.staff })),
  );

  const visiblePrimary = PRIMARY.filter(({ id }) => isRevealed(id, resources));
  const visibleSecondary = SECONDARY.filter(({ id }) => isRevealed(id, resources));

  return (
    <header className="ticker">
      <div className="ticker__row ticker__row--primary">
        {visiblePrimary.map(({ id, label }) => {
          const res = resources[id];
          const rate = getResourceRatePerSecond(production, id);
          const overCap = res.cap !== null && res.amount > res.cap;
          const nearCap = res.cap !== null && !overCap && res.amount / res.cap >= 0.9;
          const stateClass = overCap
            ? ' ticker__stat--over-cap'
            : nearCap
              ? ' ticker__stat--near-cap'
              : '';
          return (
            <div key={id} className={`ticker__stat${stateClass}`}>
              <span className="ticker__label">{label}</span>
              <span className="ticker__value">
                {formatAmount(res.amount)}
                {res.cap !== null ? ` / ${formatAmount(res.cap)}` : ''}
              </span>
              <span className="ticker__rate">{formatRate(rate)}/s</span>
            </div>
          );
        })}
      </div>
      {visibleSecondary.length > 0 && (
        <div className="ticker__row ticker__row--secondary">
          {visibleSecondary.map(({ id, label }) => (
            <div key={id} className="ticker__stat ticker__stat--compact">
              <span className="ticker__label">{label}</span>
              <span className="ticker__value">{formatAmount(resources[id].amount)}</span>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
