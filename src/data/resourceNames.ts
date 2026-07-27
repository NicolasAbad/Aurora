// UI_SPEC §4 (v2.8): player-facing UI never abbreviates a resource to its single-letter
// doc shorthand ("F"/"M"/"H"/"P" are ECONOMY_MODEL-internal only). Single source of truth
// for the full display name so every consumer (Ticker, BuildingTile, StaffHiring, manual
// action buttons) stays consistent.
import type { ResourceId } from '../core/types';

export const RESOURCE_NAME: Record<ResourceId, string> = {
  funding: 'Funding',
  materials: 'Materials',
  hardware: 'Hardware',
  propellant: 'Propellant',
  research: 'Research',
  reputation: 'Reputation',
  flightxp: 'Flight XP',
};

// UI_SPEC §4 (v3.0): "Funds use the currency symbol $ as a prefix and no noun at all —
// this is the only resource with a symbol instead of an icon." Every other resource gets
// an icon for cost/price display (icon + number, no resource noun). Icon choice itself
// isn't specified anywhere in the docs — a presentation-only pick, not a balance or
// content decision, flagged as such rather than treated as an obvious given.
export const RESOURCE_ICON: Record<ResourceId, string> = {
  funding: '$',
  materials: '📦',
  hardware: '🔧',
  propellant: '⛽',
  research: '🔬',
  reputation: '⭐',
  flightxp: '🚀',
};
