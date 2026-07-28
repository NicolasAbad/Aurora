// All values transcribed from ECONOMY_MODEL.md §4. Do not edit numbers here without
// editing them there first (CLAUDE.md rule 1). `description` text is transcribed from
// §4's own Effect column (plain mechanical fact, not narrative-ID-routed — same
// treatment as ResearchNode.description); internal-upgrade copy is real narrative
// content (NARRATIVE_EVENTS §6) and is referenced by `narrativeId`, never inlined here.
import type { BuildingDef, BuildingId } from '../core/types';

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  // ---- Complex A — Campus (unlocked at start) ----
  offices: {
    id: 'offices',
    name: 'Offices',
    complex: 'campus',
    baseCost: { funding: 100 },
    costFactor: 1.12,
    description: 'Raises your pitch yield: +5 Funding per pitch for each level above 1.',
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
    description: 'Chases investors on your behalf. Produces Funding passively, even while you’re away.',
    production: { resource: 'funding', basePerSec: 2 },
    slots: { technician: 2 },
    unlockCondition: { kind: 'start' },
    internalUpgrades: [
      { id: 'grantsDesk', name: 'Grants desk', cost: { funding: 350 }, narrativeId: 'U-10' },
    ],
  },
  rndLab: {
    id: 'rndLab',
    name: 'R&D Lab',
    complex: 'campus',
    baseCost: { funding: 250 },
    costFactor: 1.14,
    description: 'Produces Research passively. Staffed by Scientists.',
    production: { resource: 'research', basePerSec: 0.03 }, // ECONOMY §4 v2.3
    slots: { scientist: 2 },
    unlockCondition: { kind: 'start' },
    internalUpgrades: [
      { id: 'technicalArchive', name: 'Technical archive', cost: { funding: 500 }, narrativeId: 'U-11' },
      { id: 'secondResearchTrack', name: 'Second research track', cost: { funding: 1000 }, narrativeId: 'U-12' },
    ],
  },
  crewQuarters: {
    id: 'crewQuarters',
    name: 'Crew Quarters',
    complex: 'campus',
    baseCost: { funding: 120 },
    costFactor: 1.08,
    description: '+3 staff cap per level.',
    staffCapBonus: 3,
    unlockCondition: { kind: 'start' },
    internalUpgrades: [
      { id: 'classroom', name: 'Classroom', cost: { funding: 400 }, narrativeId: 'U-01' },
      { id: 'cafeteria', name: 'Cafeteria', cost: { funding: 700 }, narrativeId: 'U-02' },
    ],
  },
  trainingCenter: {
    id: 'trainingCenter',
    name: 'Training Center',
    complex: 'campus',
    baseCost: {},
    costFactor: null,
    description: 'The future home of the individual astronaut program. Locked in v1.',
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
    description: 'Produces Materials passively.',
    production: { resource: 'materials', basePerSec: 1.5 },
    slots: { technician: 2 },
    unlockCondition: { kind: 'lifetimeFunding', amount: 300 },
    internalUpgrades: [
      { id: 'bulkContracts', name: 'Bulk contracts', cost: { funding: 350 }, narrativeId: 'U-13' },
    ],
  },
  fabrication: {
    id: 'fabrication',
    name: 'Fabrication',
    complex: 'production',
    baseCost: { funding: 350, materials: 100 },
    costFactor: 1.15,
    description: 'Converts Materials into Hardware, at the program’s current tier.',
    production: { resource: 'hardware', basePerSec: 0.3, consumes: { materials: 2 } },
    slots: { engineer: 1, technician: 1 },
    unlockCondition: { kind: 'lifetimeFunding', amount: 300 },
    internalUpgrades: [
      { id: 'qaStation', name: 'QA station', cost: { funding: 600, materials: 100 }, narrativeId: 'U-15' },
    ],
  },
  refinery: {
    id: 'refinery',
    name: 'Refinery',
    complex: 'production',
    baseCost: { funding: 300, materials: 80 },
    costFactor: 1.14,
    description: 'Converts Materials into Propellant.',
    production: { resource: 'propellant', basePerSec: 0.5, consumes: { materials: 1 } },
    slots: { engineer: 1 },
    unlockCondition: { kind: 'lifetimeFunding', amount: 300 },
    internalUpgrades: [
      { id: 'recoveryLoop', name: 'Recovery loop', cost: { funding: 550 }, narrativeId: 'U-14' },
    ],
  },
  warehouse: {
    id: 'warehouse',
    name: 'Warehouse',
    complex: 'production',
    baseCost: { funding: 250, materials: 50 },
    costFactor: 1.07,
    description: '+500 Funding / +300 Materials / +75 Hardware storage cap per level.',
    capBonus: { funding: 500, materials: 300, hardware: 75 },
    unlockCondition: { kind: 'lifetimeFunding', amount: 300 },
    internalUpgrades: [
      { id: 'inventorySystem', name: 'Inventory system', cost: { funding: 700, materials: 150 }, narrativeId: 'U-16' },
    ],
  },
  propellantDepot: {
    id: 'propellantDepot',
    name: 'Propellant Depot',
    complex: 'production',
    baseCost: { funding: 400, materials: 120 },
    costFactor: 1.07,
    description: '+250 Propellant storage cap per level.',
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
    description: 'Enables engine certifications and hosts the sounding-rocket assembly workshop.',
    slots: { engineer: 2, technician: 1 },
    unlockCondition: { kind: 'tech', id: 'testStand' },
    internalUpgrades: [
      { id: 'instrumentation', name: 'Instrumentation', cost: { funding: 600, hardware: 20 }, narrativeId: 'U-04' },
    ],
  },
  launchRail: {
    id: 'launchRail',
    name: 'Launch Rail',
    complex: 'testing',
    baseCost: { funding: 300, materials: 100 },
    costFactor: null, // one-time
    description: 'Launches sounding rockets.',
    slots: { technician: 1 },
    unlockCondition: { kind: 'tech', id: 'testStand' },
    internalUpgrades: [
      { id: 'extendedRail', name: 'Extended Rail', cost: { funding: 400, materials: 100 }, narrativeId: 'U-03' },
    ],
  },
  payloadProcessing: {
    id: 'payloadProcessing',
    name: 'Payload Processing',
    complex: 'testing',
    baseCost: { funding: 1500, hardware: 200 },
    costFactor: 1.2,
    description: 'Enables satellite contracts.',
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
    description: 'Integrates rocket stages for a full launch.',
    slots: { engineer: 2, technician: 2 },
    unlockCondition: { kind: 'tech', id: 'flightProgram' },
    internalUpgrades: [
      { id: 'cleanRoom', name: 'Clean Room', cost: { funding: 2200, hardware: 70 }, narrativeId: 'U-09' },
    ],
  },
  launchPad: {
    id: 'launchPad',
    name: 'Launch Pad',
    complex: 'launch',
    baseCost: { funding: 1500, materials: 400 },
    costFactor: 1.25,
    description: 'Transfers the integrated rocket and hosts the launch itself.',
    slots: { technician: 1 },
    unlockCondition: { kind: 'tech', id: 'flightProgram' },
    internalUpgrades: [
      { id: 'serviceTower', name: 'Service Tower', cost: { funding: 800, materials: 150 }, narrativeId: 'U-05' },
      { id: 'flameTrench', name: 'Flame Trench', cost: { funding: 1200, materials: 300 }, narrativeId: 'U-06' },
    ],
  },
  launchControl: {
    id: 'launchControl',
    name: 'Launch Control',
    complex: 'launch',
    baseCost: { funding: 1000, materials: 200 },
    costFactor: 1.2,
    description: 'Runs the countdown. Staffed by Controllers.',
    slots: { controller: 3 },
    unlockCondition: { kind: 'tech', id: 'flightProgram' },
  },
  trackingStation: {
    id: 'trackingStation',
    name: 'Tracking Station',
    complex: 'launch',
    baseCost: { funding: 1200, materials: 250, hardware: 30 },
    costFactor: 1.2,
    description: '+25% Flight Experience per level from every flight. Required for orbital missions.',
    slots: { scientist: 1 },
    unlockCondition: { kind: 'tech', id: 'flightProgram' },
    // Radar is included with the base building (not a purchasable upgrade).
    internalUpgrades: [
      { id: 'antennaNetwork', name: 'Antenna Network', cost: { funding: 1500, hardware: 50 }, narrativeId: 'U-07' },
      { id: 'weatherStation', name: 'Weather Station', cost: { funding: 900, hardware: 25 }, narrativeId: 'U-08' },
    ],
  },
  launchPadB: {
    id: 'launchPadB',
    name: 'Launch Pad B',
    complex: 'launch',
    baseCost: { funding: 6000, materials: 1500, hardware: 100 },
    costFactor: null, // one-time
    description: 'A second, independent launch pad, so contracts and story missions can stage in parallel.',
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
