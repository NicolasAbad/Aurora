import type { BuildingId } from '../core/types';

/**
 * UI_SPEC §2 building-tile rule (Sprint 10.5, Visual Identity 2.0, NEW): one consistent
 * blueprint-style line icon per building, reused everywhere a building appears (tile,
 * Site Map, upgrade lists, tooltips) — single stroke weight, single accent color, no
 * illustration. Exact glyph choices are this session's call within the style; the actual
 * requirement is consistency (one mark per building, reused everywhere), same "generic,
 * reusable" spirit as RocketBlueprint. All shapes drawn in a shared 24x24 viewBox so
 * every icon sits at the same visual scale regardless of consumer.
 */
const GEAR_TEETH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function iconShapes(id: BuildingId) {
  switch (id) {
    case 'offices':
      return (
        <>
          <rect x="5" y="4" width="14" height="17" />
          <line x1="5" y1="9" x2="19" y2="9" />
          <line x1="5" y1="14" x2="19" y2="14" />
          <line x1="10" y1="4" x2="10" y2="21" />
          <line x1="14.5" y1="4" x2="14.5" y2="21" />
          <rect x="10.5" y="17" width="3" height="4" />
        </>
      );
    case 'finance':
      return (
        <>
          <line x1="4" y1="20" x2="20" y2="20" />
          <rect x="6" y="14" width="3" height="6" />
          <rect x="11" y="10" width="3" height="10" />
          <rect x="16" y="6" width="3" height="14" />
        </>
      );
    case 'rndLab':
      return (
        <>
          <line x1="9" y1="3" x2="15" y2="3" />
          <path d="M10 3 V8 L6 18 A2 2 0 0 0 8 21 H16 A2 2 0 0 0 18 18 L14 8 V3" />
          <circle cx="12" cy="15" r="1" />
        </>
      );
    case 'crewQuarters':
      return (
        <>
          <path d="M4 21 V12 L12 5 L20 12 V21 Z" />
          <line x1="7" y1="16" x2="17" y2="16" />
          <line x1="7" y1="19" x2="17" y2="19" />
        </>
      );
    case 'trainingCenter':
      return (
        <>
          <path d="M12 6 L21 10 L12 14 L3 10 Z" />
          <path d="M7 12 V17 Q12 19 17 17 V12" />
          <line x1="21" y1="10" x2="21" y2="15" />
          <circle cx="21" cy="16" r="1" />
        </>
      );
    case 'supplyDepot':
      return (
        <>
          <rect x="4" y="10" width="7" height="7" />
          <rect x="13" y="10" width="7" height="7" />
          <rect x="8.5" y="4" width="7" height="7" />
          <line x1="4" y1="10" x2="11" y2="17" />
        </>
      );
    case 'fabrication':
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1.2" />
          {GEAR_TEETH_ANGLES.map((angle) => (
            <rect key={angle} x="11" y="2.5" width="2" height="3.5" transform={`rotate(${angle} 12 12)`} />
          ))}
        </>
      );
    case 'refinery':
      return (
        <>
          <rect x="9" y="6" width="6" height="12" rx="2" />
          <line x1="12" y1="3" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="20" />
          <line x1="15" y1="9" x2="19" y2="9" />
          <line x1="19" y1="9" x2="19" y2="14" />
          <rect x="17" y="14" width="4" height="5" />
        </>
      );
    case 'warehouse':
      return (
        <>
          <rect x="3" y="9" width="18" height="11" />
          <line x1="3" y1="9" x2="12" y2="4" />
          <line x1="12" y1="4" x2="21" y2="9" />
          <rect x="8" y="13" width="8" height="7" />
        </>
      );
    case 'propellantDepot':
      return (
        <>
          <rect x="7" y="6" width="10" height="14" rx="5" />
          <line x1="12" y1="2.5" x2="12" y2="6" />
          <circle cx="12" cy="2" r="1" />
          <line x1="9" y1="11" x2="15" y2="11" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </>
      );
    case 'testStand':
      return (
        <>
          <line x1="6" y1="21" x2="6" y2="4" />
          <line x1="18" y1="21" x2="18" y2="4" />
          <line x1="6" y1="8" x2="18" y2="8" />
          <line x1="6" y1="13" x2="18" y2="13" />
          <line x1="6" y1="18" x2="18" y2="18" />
          <line x1="6" y1="8" x2="18" y2="13" />
          <line x1="18" y1="8" x2="6" y2="13" />
        </>
      );
    case 'launchRail':
      return (
        <>
          <line x1="5" y1="21" x2="17" y2="9" />
          <line x1="5" y1="21" x2="9" y2="21" />
          <path d="M16 6 L18.5 10.5 L14.5 10.5 Z" transform="rotate(30 16.5 9)" />
        </>
      );
    case 'payloadProcessing':
      return (
        <>
          <rect x="9" y="9" width="6" height="6" />
          <rect x="2.5" y="10.5" width="5.5" height="3" />
          <rect x="16" y="10.5" width="5.5" height="3" />
          <line x1="12" y1="9" x2="12" y2="4" />
          <circle cx="12" cy="3" r="1" />
        </>
      );
    case 'vab':
      return (
        <>
          <rect x="6" y="3" width="12" height="18" />
          <line x1="6" y1="9" x2="18" y2="9" />
          <rect x="9" y="13" width="6" height="8" />
        </>
      );
    case 'launchPad':
      return (
        <>
          <rect x="2" y="19" width="20" height="2" />
          <path d="M12 4 L14.5 10 L14.5 17 L9.5 17 L9.5 10 Z" />
          <path d="M9.5 17 L7 20 L9.5 20 Z" />
          <path d="M14.5 17 L17 20 L14.5 20 Z" />
        </>
      );
    case 'launchControl':
      return (
        <>
          <rect x="4" y="5" width="16" height="10" rx="1" />
          <polyline points="6,12 9,8 12,11 15,7 18,9" />
          <line x1="12" y1="15" x2="12" y2="18" />
          <line x1="8" y1="19" x2="16" y2="19" />
        </>
      );
    case 'trackingStation':
      return (
        <>
          <line x1="12" y1="21" x2="12" y2="13" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <path d="M4 13 A8 5 0 0 1 20 13" />
          <line x1="12" y1="13" x2="12" y2="8" />
          <circle cx="12" cy="7" r="1.2" />
        </>
      );
    case 'launchPadB':
      return (
        <g transform="scale(-1,1) translate(-24,0)">
          <rect x="2" y="19" width="20" height="2" />
          <path d="M12 4 L14.5 10 L14.5 17 L9.5 17 L9.5 10 Z" />
          <path d="M9.5 17 L7 20 L9.5 20 Z" />
          <path d="M14.5 17 L17 20 L14.5 20 Z" />
        </g>
      );
  }
}

interface BuildingIconProps {
  buildingId: BuildingId;
  className?: string;
}

export function BuildingIcon({ buildingId, className }: BuildingIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`building-icon${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {iconShapes(buildingId)}
    </svg>
  );
}
