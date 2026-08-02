import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { useSettings } from '../state/settings';
import { builtBuildingCount } from '../core/selectors';
import { BUILDINGS, BUILDING_IDS } from '../data/buildings';
import { BuildingIcon } from './BuildingIcon';
import type { BuildingId, BuildingState, ComplexId } from '../core/types';

// Fixed relative positions (SPRINTS.md Sprint 10.5, item 3): the 4 real building
// complexes in the SAME order BUILDINGS.ts itself declares them — 'research'/'flightXp'
// (ComplexTabs' other two tab ids) own no buildings and have no row here.
const FACILITY_COMPLEXES: { id: ComplexId; label: string }[] = [
  { id: 'campus', label: 'Campus' },
  { id: 'production', label: 'Production' },
  { id: 'testing', label: 'Testing' },
  { id: 'launch', label: 'Launch' },
];

const BUILDINGS_BY_COMPLEX: Partial<Record<ComplexId, BuildingId[]>> = (() => {
  const map: Partial<Record<ComplexId, BuildingId[]>> = {};
  for (const id of BUILDING_IDS) {
    const complex = BUILDINGS[id].complex;
    (map[complex] ??= []).push(id);
  }
  return map;
})();

function isBuilt(id: BuildingId, buildings: Record<BuildingId, BuildingState>): boolean {
  return buildings[id].level >= 1;
}

function Plot({
  buildingId,
  built,
  showLabel,
  celebrating,
}: {
  buildingId: BuildingId;
  built: boolean;
  showLabel: boolean;
  celebrating?: boolean;
}) {
  return (
    <div
      className={`site-map__plot${built ? ' site-map__plot--built' : ''}${celebrating ? ' site-map__plot--celebrating' : ''}`}
      title={BUILDINGS[buildingId].name}
    >
      {built && <BuildingIcon buildingId={buildingId} />}
      {showLabel && <span className="site-map__plot-label">{BUILDINGS[buildingId].name}</span>}
    </div>
  );
}

function SiteMapGrid({
  buildings,
  showLabels,
  celebratingId,
}: {
  buildings: Record<BuildingId, BuildingState>;
  showLabels: boolean;
  celebratingId?: BuildingId | null;
}) {
  return (
    <div className="site-map__grid">
      {FACILITY_COMPLEXES.map(({ id, label }) => (
        <div key={id} className="site-map__row">
          {showLabels && <div className="site-map__row-label">{label}</div>}
          <div className="site-map__row-plots">
            {(BUILDINGS_BY_COMPLEX[id] ?? []).map((buildingId) => (
              <Plot
                key={buildingId}
                buildingId={buildingId}
                built={isBuilt(buildingId, buildings)}
                showLabel={showLabels}
                celebrating={buildingId === celebratingId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface SiteMapScreenProps {
  onClose: () => void;
}

/**
 * UI_SPEC §2h (SECOND rework, v3.7): the Program Site Map as its own destination, not a
 * corner passenger on the Current Directive anymore — a bigger thumbnail still registered
 * as no impact (real playtest finding). Reached via a dedicated ticker-area icon+count
 * (Ticker.tsx, same weight as the Constellation View's own entry point) rather than being
 * rendered unconditionally in a corner. Schematic top-down layout, four complexes in
 * fixed relative positions, each building a blueprint pictogram that's already been
 * introduced via SiteMapCelebration's own moment by the time it's sitting in this view.
 */
export function SiteMapScreen({ onClose }: SiteMapScreenProps) {
  const buildings = useGameStore(useShallow((s) => s.buildings));

  return (
    <div className="site-map-backdrop" onClick={onClose}>
      <div className="site-map-screen" role="dialog" aria-label="Program Site Map" onClick={(e) => e.stopPropagation()}>
        <div className="site-map-screen__header">
          <h2>Program Site Map</h2>
          <button type="button" onClick={onClose} aria-label="Close site map">
            ×
          </button>
        </div>
        <SiteMapGrid buildings={buildings} showLabels />
      </div>
    </div>
  );
}

const CELEBRATION_MS = 2400;

/**
 * UI_SPEC §2h (SECOND rework, v3.7): "a celebration moment on every new building" — the
 * moment growth becomes something that happens TO the player's view rather than a small
 * box they'd have to notice on their own. Same "baseline captured at mount, diff on
 * change" shape TierChangeToast/MilestoneCallout already use (App.tsx) — a returning
 * player with buildings already built must not see this replay for all of them. Detects
 * a building's FIRST construction (level 0 -> 1) specifically, not every subsequent
 * upgrade level; buildings are bought synchronously via a single player action (never a
 * timed/offline process), so at most one can newly cross that line per state update.
 * Reduced motion: still announces via aria-live, but skips the zoom/draw animation and
 * dismisses on the same short timer rather than looking frozen mid-animation.
 */
export function SiteMapCelebration() {
  const buildings = useGameStore(useShallow((s) => s.buildings));
  // Sprint 11.5 Priority-1 bug class, caught here too via live Playwright verification
  // (unit tests alone missed it — they call setState directly, never a real continuous
  // tick loop): resolveEconomyTick's Fabrication/Refinery starvation bookkeeping returns
  // a NEW object reference every tick even when the values are unchanged, so `buildings`
  // (via useShallow) "changes" on essentially every frame. Keying the effect on that
  // object directly would restart/cancel the dismiss timer before it ever fired — the
  // exact useRollingNumber freeze, just for a setTimeout instead of a rAF loop. Fix:
  // depend on a STABLE primitive (the built count, itself a plain-number Zustand
  // subscription with the usual strict-equality check) that only actually changes the
  // instant a building crosses 0 -> 1, and read the latest `buildings` via a ref inside
  // the effect rather than closing over the churning reactive value.
  const builtCount = useGameStore((s) => builtBuildingCount(s.buildings));
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const buildingsRef = useRef(buildings);
  buildingsRef.current = buildings;
  const builtRef = useRef<Set<BuildingId>>(
    new Set(BUILDING_IDS.filter((id) => isBuilt(id, buildings))),
  );
  const [celebrating, setCelebrating] = useState<BuildingId | null>(null);

  useEffect(() => {
    const current = buildingsRef.current;
    const newlyBuilt = BUILDING_IDS.find((id) => isBuilt(id, current) && !builtRef.current.has(id));
    if (!newlyBuilt) return;
    builtRef.current = new Set(builtRef.current).add(newlyBuilt);
    setCelebrating(newlyBuilt);
    const t = setTimeout(() => setCelebrating(null), CELEBRATION_MS);
    return () => clearTimeout(t);
  }, [builtCount]);

  if (!celebrating) return null;
  return (
    <div
      className={`site-map-celebration-backdrop${reducedMotion ? ' site-map-celebration-backdrop--static' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="site-map-celebration">
        <div className="site-map-celebration__title">{BUILDINGS[celebrating].name} built</div>
        <SiteMapGrid buildings={buildings} showLabels celebratingId={celebrating} />
      </div>
    </div>
  );
}
