import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
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

function Plot({ buildingId, built, showLabel }: { buildingId: BuildingId; built: boolean; showLabel: boolean }) {
  return (
    <div
      className={`site-map__plot${built ? ' site-map__plot--built' : ''}`}
      title={BUILDINGS[buildingId].name}
    >
      {built && <BuildingIcon buildingId={buildingId} />}
      {showLabel && <span className="site-map__plot-label">{BUILDINGS[buildingId].name}</span>}
    </div>
  );
}

function SiteMapGrid({ buildings, showLabels }: { buildings: Record<BuildingId, BuildingState>; showLabels: boolean }) {
  return (
    <div className="site-map__grid">
      {FACILITY_COMPLEXES.map(({ id, label }) => (
        <div key={id} className="site-map__row">
          {showLabels && <div className="site-map__row-label">{label}</div>}
          <div className="site-map__row-plots">
            {(BUILDINGS_BY_COMPLEX[id] ?? []).map((buildingId) => (
              <Plot key={buildingId} buildingId={buildingId} built={isBuilt(buildingId, buildings)} showLabel={showLabels} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * UI_SPEC §2h amended (Sprint 10.5, Visual Identity 2.0, NEW): the Current Directive's
 * visual backing — a small evolving blueprint map of the whole facility. Buildings fade
 * in as pictograms (BuildingIcon, item 4) the instant they're built; unbuilt plots stay
 * faint dashed outlines. Deliberately NOT gated on CurrentDirective having an active
 * directive to show (core/directive.ts's `currentDirective` returns null once every
 * D-01..D-12 condition has been passed, which happens well before end-game) — a
 * persistent element that always renders, same "grows as you build" spirit as the ticker
 * itself never disappearing. Tap the thumbnail to expand full-screen with building names.
 */
export function SiteMap() {
  const buildings = useGameStore(useShallow((s) => s.buildings));
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <button
        type="button"
        className="site-map__thumbnail"
        aria-label="Program Site Map. Tap to expand."
        onClick={() => setExpanded(true)}
      >
        <SiteMapGrid buildings={buildings} showLabels={false} />
      </button>
      {expanded && (
        <div className="site-map-backdrop" onClick={() => setExpanded(false)}>
          <div
            className="site-map-screen"
            role="dialog"
            aria-label="Program Site Map"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="site-map-screen__header">
              <h2>Program Site Map</h2>
              <button type="button" onClick={() => setExpanded(false)} aria-label="Close site map">
                ×
              </button>
            </div>
            <SiteMapGrid buildings={buildings} showLabels />
          </div>
        </div>
      )}
    </>
  );
}
