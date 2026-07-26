// Starting state transcribed from ECONOMY_MODEL.md §1.
import { BUILDING_IDS } from './buildings';
import type { BuildingId, ChecklistItemId, GameState, RoleId } from '../core/types';

function zeroPerBuilding(): Record<BuildingId, number> {
  return Object.fromEntries(BUILDING_IDS.map((id) => [id, 0])) as Record<BuildingId, number>;
}

const EMPTY_CHECKLIST: Record<ChecklistItemId, boolean> = {
  rocketIntegrated: false,
  enginesCertified: false,
  transferToPad: false,
  propellantLoaded: false,
  flightReview: false,
  controllersOnStation: false,
  trackingActive: false,
  weatherWindow: false,
};

const ROLE_IDS: RoleId[] = ['technician', 'engineer', 'scientist', 'controller'];

export function createInitialState(): GameState {
  return {
    schemaVersion: 3,
    lastSeenAt: Date.now(),
    resources: {
      funding: { amount: 0, cap: 500, lifetimeEarned: 0 },
      research: { amount: 0, cap: null, lifetimeEarned: 0 },
      materials: { amount: 0, cap: 200, lifetimeEarned: 0 },
      propellant: { amount: 0, cap: 0, lifetimeEarned: 0 }, // requires Propellant Depot
      reputation: { amount: 0, cap: null, lifetimeEarned: 0 },
      flightxp: { amount: 0, cap: null, lifetimeEarned: 0 },
      hardware: {
        amount: 0,
        cap: 50,
        lifetimeEarned: 0,
        byTier: { aluminum: 0, titanium: 0 },
      },
    },
    staff: {
      pools: Object.fromEntries(
        ROLE_IDS.map((role) => [role, { hired: 0, assigned: zeroPerBuilding() }]),
      ) as GameState['staff']['pools'],
      astronauts: [],
    },
    buildings: Object.fromEntries(
      BUILDING_IDS.map((id) => [
        id,
        { level: id === 'offices' ? 1 : 0, upgrades: [], starvedIndicator: false, fedStreakMs: 0 },
      ]),
    ) as unknown as GameState['buildings'],
    research: { completed: [], inProgress: null },
    certifications: {
      engines: {
        probe1: { attempted: false, certified: false, extendedCertified: false },
        orbital1: { attempted: false, certified: false, extendedCertified: false },
      },
      inProgress: null,
    },
    processes: [],
    modifiers: [],
    mission: {
      pads: {
        padA: {
          rocketStatus: 'none',
          stagesDone: [],
          checklist: { ...EMPTY_CHECKLIST },
          confidence: 0,
          committedRoll: null,
        },
      },
      launches: [],
    },
    economyFlags: { payrollUnpaid: false },
    contracts: { offers: [], active: [] },
    records: [],
    narrative: { seen: [] },
    telemetry: [],
  };
}
