import type { ComplexId } from '../core/types';

// Unlock gates per GDD §3 / ECONOMY_MODEL §4 complex headers. Production/Testing/Launch
// are not built until later sprints — Sprint 0 only needs them visible-but-locked.
const COMPLEXES: { id: ComplexId; label: string; unlocked: boolean; condition: string }[] = [
  { id: 'campus', label: 'Campus', unlocked: true, condition: '' },
  {
    id: 'production',
    label: 'Production',
    unlocked: false,
    condition: 'Unlocks at 300 lifetime Funding',
  },
  { id: 'testing', label: 'Testing', unlocked: false, condition: 'Unlocks with tech: Test stand' },
  {
    id: 'launch',
    label: 'Launch',
    unlocked: false,
    condition: 'Unlocks with tech: Flight program',
  },
];

interface ComplexTabsProps {
  active: ComplexId;
  onSelect: (id: ComplexId) => void;
}

export function ComplexTabs({ active, onSelect }: ComplexTabsProps) {
  return (
    <nav className="complex-tabs">
      {COMPLEXES.map((c) => (
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
