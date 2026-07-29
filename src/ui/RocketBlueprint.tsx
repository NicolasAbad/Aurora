import type { AuroraStageId } from '../data/auroraI';

interface RocketBlueprintProps {
  stagesDone: string[];
}

/**
 * UI_SPEC screen 4 (Sprint 9.5, NEW — "something real to look at"): the rocket's
 * blueprint builds up stage by stage as VAB integration progresses — an empty dashed
 * outline at start, filling in Structure, then Engines, then Guidance, then the payload
 * fairing, then final-integration dimension marks — instead of appearing complete only
 * at the end. Blueprint aesthetic (UI_SPEC §1b): geometric technical-schematic SVG, thin
 * lines, engineering-drawing style — no new art pipeline, just plain inline SVG shapes.
 * Generic over `stagesDone` (not hardcoded to a specific pad or mission), so Aurora II's
 * integration can reuse this same component once it exists (SPRINTS.md's own note).
 */
export function RocketBlueprint({ stagesDone }: RocketBlueprintProps) {
  const has = (id: AuroraStageId) => stagesDone.includes(id);
  const structureDone = has('structure');

  return (
    <svg viewBox="0 0 120 220" className="rocket-blueprint" aria-hidden="true">
      {/* Empty outline: always visible — dashed until Structure completes, then solid. */}
      <path
        className={`rocket-blueprint__outline${structureDone ? ' rocket-blueprint__outline--solid' : ''}`}
        d="M60 10 L78 60 L78 170 Q78 192 60 202 Q42 192 42 170 L42 60 Z"
      />

      {/* Structure: the main fuselage body. */}
      {structureDone && <rect className="rocket-blueprint__part" x="46" y="64" width="28" height="100" />}

      {/* Engines: nozzles at the base. */}
      {has('engines') && (
        <g className="rocket-blueprint__part">
          <path d="M46 164 L37 188 L50 179 Z" />
          <path d="M74 164 L83 188 L70 179 Z" />
          <path d="M53 164 L53 186 L60 194 L67 186 L67 164 Z" />
        </g>
      )}

      {/* Guidance: avionics band near the top of the body. */}
      {has('guidance') && <rect className="rocket-blueprint__part" x="46" y="66" width="28" height="9" />}

      {/* Satellite payload: the nose fairing. */}
      {has('satellitePayload') && <path className="rocket-blueprint__part" d="M60 10 L78 60 L42 60 Z" />}

      {/* Final integration: dimension marks — the "ready for review" finishing pass. */}
      {has('finalIntegration') && (
        <g className="rocket-blueprint__marks">
          <line x1="18" y1="60" x2="18" y2="202" />
          <line x1="14" y1="60" x2="22" y2="60" />
          <line x1="14" y1="202" x2="22" y2="202" />
        </g>
      )}
    </svg>
  );
}
