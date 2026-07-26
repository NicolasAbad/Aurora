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
