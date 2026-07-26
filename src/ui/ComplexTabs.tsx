import { useGameStore } from '../state/persistStore';
import type { ComplexId } from '../core/types';

const PRODUCTION_UNLOCK_FUNDING = 300; // ECONOMY §4: Complex B unlock, lifetime Funding

// Unlock gates per GDD §3 / ECONOMY_MODEL §4 complex headers. Testing/Launch are not
// reachable until their tech nodes exist (Sprint 4+) — still visible-but-locked in v1.
const STATIC_COMPLEXES: { id: ComplexId; label: string; condition: string }[] = [
  { id: 'testing', label: 'Testing', condition: 'Unlocks with tech: Test stand' },
  { id: 'launch', label: 'Launch', condition: 'Unlocks with tech: Flight program' },
];

interface ComplexTabsProps {
  active: ComplexId;
  onSelect: (id: ComplexId) => void;
}

export function ComplexTabs({ active, onSelect }: ComplexTabsProps) {
  const lifetimeFunding = useGameStore((s) => s.resources.funding.lifetimeEarned);

  const complexes = [
    { id: 'campus' as const, label: 'Campus', unlocked: true, condition: '' },
    {
      id: 'production' as const,
      label: 'Production',
      unlocked: lifetimeFunding >= PRODUCTION_UNLOCK_FUNDING,
      condition: 'Unlocks at 300 lifetime Funding',
    },
    ...STATIC_COMPLEXES.map((c) => ({ ...c, unlocked: false })),
  ];

  return (
    <nav className="complex-tabs">
      {complexes.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`complex-tabs__tab${active === c.id ? ' complex-tabs__tab--active' : ''}${
            c.unlocked ? '' : ' complex-tabs__tab--locked'
          }`}
          disabled={!c.unlocked}
          title={c.unlocked ? undefined : c.condition}
          onClick={() => c.unlocked && onSelect(c.id)}
        >
          <span>{c.label}</span>
          {!c.unlocked && <span className="complex-tabs__condition">{c.condition}</span>}
        </button>
      ))}
    </nav>
  );
}
