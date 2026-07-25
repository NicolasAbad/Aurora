// All values transcribed from ECONOMY_MODEL.md §4. Do not edit numbers here without
// editing them there first (CLAUDE.md rule 1).
import type { BuildingDef, BuildingId } from '../core/types';

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  // ---- Complex A — Campus (unlocked at start) ----
  offices: {
    id: 'offices',
    name: 'Offices',
    complex: 'campus',
    baseCost: { funding: 100 },
    costFactor: 1.12,
    unlockCondition: { kind: 'start' },
    // Effect: pitch yield = core/economy.ts's pitchYield(officesLevel), ECONOMY §2 —
    // read by the manual-pitch action, not `production`.
  },
  finance: {
    id: 'finance',
    name: 'Finance',
    complex: 'campus',
    baseCost: { funding: 150 },
    costFactor: 1.14,
    production: { resource: 'funding', basePerSec: 2 },
    slots: { technician: 2 },
    unlockCondition: { kind: 'start' },
  },
  rndLab: {
    id: 'rndLab',
    name: 'R&D Lab',
    complex: 'campus',
    baseCost: { funding: 250 },
    costFactor: 1.14,
    production: { resource: 'research', basePerSec: 0.03 }, // ECONOMY §4 v2.3
    slots: { scientist: 2 },
    unlockCondition: { kind: 'start' },
  },
  crewQuarters: {
    id: 'crewQuarters',
    name: 'Crew Quarters',
    complex: 'campus',
    baseCost: { funding: 120 },
    costFactor: 1.08,
    staffCapBonus: 3,
    unlockCondition: { kind: 'start' },
    internalUpgrades: [
      {
        id: 'classroom',
        name: 'Classroom',
        cost: { funding: 400 },
        description: 'Enables role promotions (Technician→Engineer, Engineer→Scientist).',
      },
      {
        id: 'cafeteria',
        name: 'Cafeteria',
        cost: { funding: 700 },
        description: '-10% effective salaries.',
      },
    ],
  },
  trainingCenter: {
    id: 'trainingCenter',
    name: 'Training Center',
    complex: 'campus',
    baseCost: {},
    costFactor: null,
    teaser: true, // UI_SPEC §2b: the only v1 teaser — the deliberate era-2 tease
    unlockCondition: { kind: 'locked' },
    // LOCKED v1 (visible-but-locked); astronaut system is era 2.
  },

  // ---- Complex B — Production (unlock: lifetime Funding earned >= 300) ----
  supplyDepot: {
    id: 'supplyDepot',
    name: 'Supply Depot',
    complex: 'production',
    baseCost: { funding: 200 },
    costFactor: 1.13,
    production: { resource: 'materials', basePerSec: 1.5 },
    slots: { technician: 2 },
    unlockCondition: { kind: 'lifetimeFunding', amount: 300 },
  },
  fabrication: {
    id: 'fabrication',
    name: 'Fabrication',
    complex: 'production',
    baseCost: { funding: 350, materials: 100 },
    costFactor: 1.15,
    production: { resource: 'hardware', basePerSec: 0.3, consumes: { materials: 2 } },
    slots: { engineer: 1, technician: 1 },
    unlockCondition: { kind: 'lifetimeFunding', amount: 300 },
  },
  refinery: {
    id: 'refinery',
    name: 'Refinery',
    complex: 'production',
    baseCost: { funding: 300, materials: 80 },
    costFactor: 1.14,
    production: { resource: 'propellant', basePerSec: 0.5, consumes: { materials: 1 } },
    slots: { engineer: 1 },
    unlockCondition: { kind: 'lifetimeFunding', amount: 300 },
  },
  warehouse: {
    id: 'warehouse',
    name: 'Warehouse',
    complex: 'production',
    baseCost: { funding: 250, materials: 50 },
    costFactor: 1.07,
    capBonus: { funding: 500, materials: 300, hardware: 75 },
    unlockCondition: { kind: 'lifetimeFunding', amount: 300 },
  },
  propellantDepot: {
    id: 'propellantDepot',
    name: 'Propellant Depot',
    complex: 'production',
    baseCost: { funding: 400, materials: 120 },
    costFactor: 1.07,
    capBonus: { propellant: 250 },
    unlockCondition: { kind: 'lifetimeFunding', amount: 300 },
  },

  // ---- Complex C — Testing (unlock: tech "Test stand") ----
  testStand: {
    id: 'testStand',
    name: 'Engine Test Stand',
    complex: 'testing',
    baseCost: { funding: 800, materials: 300, hardware: 40 },
    costFactor: 1.2,
    slots: { engineer: 2, technician: 1 },
    unlockCondition: { kind: 'tech', id: 'testStand' },
    internalUpgrades: [
      {
        id: 'instrumentation',
        name: 'Instrumentation',
        cost: { funding: 600, hardware: 20 },
        description: '-25% certification time.',
      },
      {
        id: 'cryogenicStand',
        name: 'Cryogenic Stand',
        cost: { funding: 2000, hardware: 80 },
        description: 'Tier-2 engines (v2).',
      },
    ],
  },
  launchRail: {
    id: 'launchRail',
    name: 'Launch Rail',
    complex: 'testing',
    baseCost: { funding: 300, materials: 100 },
    costFactor: null, // one-time
    slots: { technician: 1 },
    unlockCondition: { kind: 'tech', id: 'testStand' },
    internalUpgrades: [
      {
        id: 'extendedRail',
        name: 'Extended Rail',
        cost: { funding: 400, materials: 100 },
        description: 'Enables S-2 high-altitude sondas.',
      },
    ],
  },
  payloadProcessing: {
    id: 'payloadProcessing',
    name: 'Payload Processing',
    complex: 'testing',
    baseCost: { funding: 1500, hardware: 200 },
    costFactor: 1.2,
    slots: { engineer: 1, scientist: 1 },
    unlockCondition: { kind: 'auroraISuccess' },
    // GDD §3: "unlocks after Aurora I success; required by satellite contracts" —
    // overrides the complex's general tech gate for this specific building.
  },

  // ---- Complex D — Launch (unlock: tech "Flight program") ----
  vab: {
    id: 'vab',
    name: 'VAB',
    complex: 'launch',
    baseCost: { funding: 2000, materials: 500 },
    costFactor: 1.25,
    slots: { engineer: 2, technician: 2 },
    unlockCondition: { kind: 'tech', id: 'flightProgram' },
    internalUpgrades: [
      {
        id: 'heavyCrane',
        name: 'Heavy Crane',
        cost: { funding: 1800, hardware: 60 },
        description: 'Large stages (v2).',
      },
      {
        id: 'cleanRoom',
        name: 'Clean Room',
        cost: { funding: 2200, hardware: 70 },
        description: 'Enables tier-2 contracts.',
      },
    ],
  },
  launchPad: {
    id: 'launchPad',
    name: 'Launch Pad',
    complex: 'launch',
    baseCost: { funding: 1500, materials: 400 },
    costFactor: 1.25,
    slots: { technician: 1 },
    unlockCondition: { kind: 'tech', id: 'flightProgram' },
    internalUpgrades: [
      {
        id: 'serviceTower',
        name: 'Service Tower',
        cost: { funding: 800, materials: 150 },
        description: '+5 Confidence.',
      },
      {
        id: 'flameTrench',
        name: 'Flame Trench',
        cost: { funding: 1200, materials: 300 },
        description: '-30% pad turnaround.',
      },
      {
        id: 'soundSuppression',
        name: 'Sound Suppression',
        cost: { funding: 2500, materials: 500 },
        description: 'Heavy launch class (v2).',
      },
    ],
  },
  launchControl: {
    id: 'launchControl',
    name: 'Launch Control',
    complex: 'launch',
    baseCost: { funding: 1000, materials: 200 },
    costFactor: 1.2,
    slots: { controller: 3 },
    unlockCondition: { kind: 'tech', id: 'flightProgram' },
  },
  trackingStation: {
    id: 'trackingStation',
    name: 'Tracking Station',
    complex: 'launch',
    baseCost: { funding: 1200, materials: 250, hardware: 30 },
    costFactor: 1.2,
    slots: { scientist: 1 },
    unlockCondition: { kind: 'tech', id: 'flightProgram' },
    // Radar is included with the base building (no separate purchase).
    internalUpgrades: [
      {
        id: 'antennaNetwork',
        name: 'Antenna Network',
        cost: { funding: 1500, hardware: 50 },
        description: '+25% Flight XP.',
      },
      {
        id: 'weatherStation',
        name: 'Weather Station',
        cost: { funding: 900, hardware: 25 },
        description: 'Weather windows every 2 min (fixed).',
      },
    ],
  },
  launchPadB: {
    id: 'launchPadB',
    name: 'Launch Pad B',
    complex: 'launch',
    baseCost: { funding: 6000, materials: 1500, hardware: 100 },
    costFactor: null, // one-time
    slots: { technician: 1 },
    unlockCondition: {
      kind: 'all',
      conditions: [{ kind: 'auroraISuccess' }, { kind: 'reputation', amount: 40 }],
    },
    // Needs its own Service Tower purchase for +5 Confidence (per-pad, ECONOMY §4) —
    // handled by the Sprint 9 per-pad mission system, not duplicated here.
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
