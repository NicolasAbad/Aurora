import { useGameStore } from '../state/persistStore';
import type { ComplexId } from '../core/types';

const PRODUCTION_UNLOCK_FUNDING = 300; // ECONOMY §4: Complex B unlock, lifetime Funding
const TESTING_UNLOCK_TECH = 'testStand'; // ECONOMY §4: Complex C unlock, tech "Test stand"
const LAUNCH_UNLOCK_TECH = 'flightProgram'; // ECONOMY §4: Complex D unlock, tech "Flight program"

interface ComplexTabsProps {
  active: ComplexId;
  onSelect: (id: ComplexId) => void;
}

export function ComplexTabs({ active, onSelect }: ComplexTabsProps) {
  const lifetimeFunding = useGameStore((s) => s.resources.funding.lifetimeEarned);
  const testingUnlocked = useGameStore((s) => s.research.completed.includes(TESTING_UNLOCK_TECH));
  const launchUnlocked = useGameStore((s) => s.research.completed.includes(LAUNCH_UNLOCK_TECH));
  const researchUnlocked = useGameStore((s) => s.buildings.rndLab.level >= 1);

  const complexes = [
    { id: 'campus' as const, label: 'Campus', unlocked: true, condition: '' },
    {
      id: 'production' as const,
      label: 'Production',
      unlocked: lifetimeFunding >= PRODUCTION_UNLOCK_FUNDING,
      condition: 'Unlocks at 300 lifetime Funding',
    },
    // UI_SPEC §2g (Sprint 9.5): Research promoted from a panel inside Campus to its own
    // top-level tab — same unlock condition (R&D Lab built) it always had.
    {
      id: 'research' as const,
      label: 'Research',
      unlocked: researchUnlocked,
      condition: 'Unlocks when R&D Lab is built',
    },
    {
      id: 'testing' as const,
      label: 'Testing',
      unlocked: testingUnlocked,
      condition: 'Unlocks with tech: Test stand',
    },
    // Sprint 7: state-driven like Testing (VAB/Pad/Launch Control/Tracking Station now
    // have real panel content to unlock onto).
    { id: 'launch' as const, label: 'Launch', unlocked: launchUnlocked, condition: 'Unlocks with tech: Flight program' },
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
