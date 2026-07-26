import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import {
  adjustStaffAssignment,
  applyCompletedProcesses,
  applyGatherMaterials,
  applyPitch,
  applyRushOrder,
  buyBuildingUpgrade,
  hireStaff,
  startPromotion,
  startResearch,
} from './actions';
import type { Process } from './types';

describe('applyPitch', () => {
  it('grants pitchYield(officesLevel) as a one-time Funding grant', () => {
    const state = createInitialState();
    const resources = applyPitch(state.resources, 1);
    expect(resources.funding.amount).toBe(10);
  });

  it('ignores the Funding cap (GDD §1c)', () => {
    const state = createInitialState();
    state.resources.funding.amount = 495;
    state.resources.funding.cap = 500;
    const resources = applyPitch(state.resources, 3); // yield 20
    expect(resources.funding.amount).toBe(515);
  });
});

describe('applyGatherMaterials', () => {
  it('grants a free, one-time Materials yield once Supply Depot is built', () => {
    const state = createInitialState();
    state.buildings.supplyDepot.level = 1;
    const resources = applyGatherMaterials(state.resources, state.buildings.supplyDepot.level);
    expect(resources).not.toBeNull();
    expect(resources!.materials.amount).toBe(5);
  });

  it('refuses before Supply Depot lv1 (ECONOMY §2 unlock)', () => {
    const state = createInitialState();
    expect(applyGatherMaterials(state.resources, state.buildings.supplyDepot.level)).toBeNull();
  });

  it('ignores the Materials cap, like Pitch ignores the Funding cap (GDD §1c)', () => {
    const state = createInitialState();
    state.resources.materials.amount = 198;
    state.resources.materials.cap = 200;
    const resources = applyGatherMaterials(state.resources, 1);
    expect(resources!.materials.amount).toBe(203);
  });
});

describe('applyRushOrder', () => {
  it('trades 150 Funding for 100 Materials once Fabrication is built', () => {
    const state = createInitialState();
    state.buildings.fabrication.level = 1;
    state.resources.funding.amount = 200;
    const resources = applyRushOrder(state.resources, state.buildings.fabrication.level);
    expect(resources).not.toBeNull();
    expect(resources!.funding.amount).toBe(50);
    expect(resources!.materials.amount).toBe(100);
  });

  it('refuses before Fabrication is built', () => {
    const state = createInitialState();
    state.resources.funding.amount = 1000;
    expect(applyRushOrder(state.resources, state.buildings.fabrication.level)).toBeNull();
  });

  it('refuses when Funding cannot cover the 150 F cost', () => {
    const state = createInitialState();
    state.buildings.fabrication.level = 1;
    state.resources.funding.amount = 100;
    expect(applyRushOrder(state.resources, state.buildings.fabrication.level)).toBeNull();
  });
});

describe('buyBuildingUpgrade', () => {
  it('returns null when unaffordable', () => {
    const state = createInitialState();
    expect(buyBuildingUpgrade(state.resources, state.buildings, 'finance')).toBeNull();
  });

  it('pays cost and increments level when affordable', () => {
    const state = createInitialState();
    state.resources.funding.amount = 200;
    const result = buyBuildingUpgrade(state.resources, state.buildings, 'finance');
    expect(result).not.toBeNull();
    expect(result!.buildings.finance.level).toBe(1);
    expect(result!.resources.funding.amount).toBe(50); // 200 - 150
  });

  it('refuses to re-buy a one-time building already built', () => {
    const state = createInitialState();
    state.resources.funding.amount = 10_000;
    state.buildings.launchRail.level = 1; // already built (one-time)
    expect(buyBuildingUpgrade(state.resources, state.buildings, 'launchRail')).toBeNull();
  });
});

describe('hireStaff', () => {
  it('hires an unlocked, affordable, in-cap role', () => {
    const state = createInitialState();
    state.resources.funding.amount = 100;
    const result = hireStaff(state.resources, state.staff, [], 0, 'technician');
    expect(result).not.toBeNull();
    expect(result!.staff.pools.technician.hired).toBe(1);
    expect(result!.resources.funding.amount).toBe(50); // base cost, 0 already hired
  });

  it('refuses a tech-gated role without its tech researched', () => {
    const state = createInitialState();
    state.resources.funding.amount = 1000;
    expect(hireStaff(state.resources, state.staff, [], 0, 'engineer')).toBeNull();
  });

  it('allows a tech-gated role once its tech is completed', () => {
    const state = createInitialState();
    state.resources.funding.amount = 1000;
    const result = hireStaff(state.resources, state.staff, ['basicEngineering'], 0, 'engineer');
    expect(result).not.toBeNull();
  });

  it('refuses to hire past the staff cap', () => {
    const state = createInitialState();
    state.resources.funding.amount = 10_000;
    state.staff.pools.technician.hired = 2; // starting cap is 2, crewQuarters level 0
    expect(hireStaff(state.resources, state.staff, [], 0, 'technician')).toBeNull();
  });

  it('scales cost by 1.15^hired', () => {
    const state = createInitialState();
    state.resources.funding.amount = 1000;
    state.staff.pools.technician.hired = 1;
    const result = hireStaff(state.resources, state.staff, [], 5, 'technician');
    expect(result!.resources.funding.amount).toBeCloseTo(1000 - 50 * 1.15);
  });
});

describe('adjustStaffAssignment', () => {
  it('assigns an unassigned hired unit up to the building slot count', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 1;
    state.buildings.finance.level = 1;
    const staff = adjustStaffAssignment(state.staff, 'technician', 'finance', 1, 1);
    expect(staff).not.toBeNull();
    expect(staff!.pools.technician.assigned.finance).toBe(1);
  });

  it('refuses to assign more than are hired-and-unassigned', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 0;
    state.buildings.finance.level = 1;
    expect(adjustStaffAssignment(state.staff, 'technician', 'finance', 1, 1)).toBeNull();
  });

  it('refuses to assign past the building slot count (Finance: 2 Technician)', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 3;
    state.staff.pools.technician.assigned.finance = 2;
    state.buildings.finance.level = 1;
    expect(adjustStaffAssignment(state.staff, 'technician', 'finance', 1, 1)).toBeNull();
  });

  it('unassigns down to zero but not below', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 1;
    state.staff.pools.technician.assigned.finance = 1;
    state.buildings.finance.level = 1;
    const staff = adjustStaffAssignment(state.staff, 'technician', 'finance', -1, 1);
    expect(staff!.pools.technician.assigned.finance).toBe(0);
    expect(adjustStaffAssignment(staff!, 'technician', 'finance', -1, 1)).toBeNull();
  });

  // ECONOMY §4 (v2.8) regression: staff could previously be assigned to a level-0
  // (unbuilt) building, occupying a "slot" that doesn't exist and producing nothing.
  it('refuses to assign to an unbuilt (level 0) building even if hired-and-unassigned', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 1; // finance.level stays 0 (default, unbuilt)
    expect(adjustStaffAssignment(state.staff, 'technician', 'finance', 1, 0)).toBeNull();
  });
});

describe('startResearch', () => {
  it('starts an available, affordable node, deducting Research and setting inProgress', () => {
    const state = createInitialState();
    state.resources.research.amount = 30;
    const now = Date.now();
    const result = startResearch(state.resources, state.research, 'aluminum', now);
    expect(result).not.toBeNull();
    expect(result!.resources.research.amount).toBe(5); // 30 - 25
    expect(result!.research.inProgress).toEqual({
      id: 'research-aluminum',
      kind: 'research',
      startedAt: now,
      durationMs: 5 * 60_000,
      payload: { nodeId: 'aluminum' },
    });
  });

  it('refuses when something is already in progress (one node at a time)', () => {
    const state = createInitialState();
    state.resources.research.amount = 1000;
    state.research.inProgress = {
      id: 'x',
      kind: 'research',
      startedAt: Date.now(),
      durationMs: 1000,
      payload: { nodeId: 'soundingRockets' },
    };
    expect(startResearch(state.resources, state.research, 'aluminum', Date.now())).toBeNull();
  });

  it('refuses an unavailable node (deps not met)', () => {
    const state = createInitialState();
    state.resources.research.amount = 1000;
    expect(startResearch(state.resources, state.research, 'titanium', Date.now())).toBeNull();
  });

  it('refuses when Research cannot cover the cost', () => {
    const state = createInitialState();
    state.resources.research.amount = 10; // aluminum costs 25
    expect(startResearch(state.resources, state.research, 'aluminum', Date.now())).toBeNull();
  });
});

describe('startPromotion', () => {
  it('pays Funding, removes one unassigned unit from `from`, and queues a training process', () => {
    const state = createInitialState();
    state.resources.funding.amount = 200;
    state.staff.pools.technician.hired = 1;
    const now = Date.now();
    const result = startPromotion(state.resources, state.staff, state.processes, true, 'technician', 'engineer', now);
    expect(result).not.toBeNull();
    expect(result!.resources.funding.amount).toBe(100); // 200 - 100
    expect(result!.staff.pools.technician.hired).toBe(0);
    expect(result!.processes).toEqual([
      { id: `promotion-technician-engineer-${now}`, kind: 'training', startedAt: now, durationMs: 15 * 60_000, payload: { from: 'technician', to: 'engineer' } },
    ]);
  });

  it('refuses without the Classroom built (ECONOMY §3: gated only by Classroom, never by the target role\'s tech)', () => {
    const state = createInitialState();
    state.resources.funding.amount = 200;
    state.staff.pools.technician.hired = 1;
    expect(startPromotion(state.resources, state.staff, state.processes, false, 'technician', 'engineer', Date.now())).toBeNull();
  });

  it('refuses without an unassigned unit of `from`', () => {
    const state = createInitialState();
    state.resources.funding.amount = 200;
    state.staff.pools.technician.hired = 1;
    state.staff.pools.technician.assigned.finance = 1; // the only one is already assigned
    expect(startPromotion(state.resources, state.staff, state.processes, true, 'technician', 'engineer', Date.now())).toBeNull();
  });

  it('refuses when Funding cannot cover the cost', () => {
    const state = createInitialState();
    state.resources.funding.amount = 50; // needs 100
    state.staff.pools.technician.hired = 1;
    expect(startPromotion(state.resources, state.staff, state.processes, true, 'technician', 'engineer', Date.now())).toBeNull();
  });
});

describe('applyCompletedProcesses', () => {
  it('grants the promoted role its unit on training completion', () => {
    const state = createInitialState();
    const process: Process = {
      id: 'p1',
      kind: 'training',
      startedAt: 0,
      durationMs: 1000,
      payload: { from: 'technician', to: 'engineer' },
    };
    const staff = applyCompletedProcesses(state.staff, [process]);
    expect(staff.pools.engineer.hired).toBe(1);
  });

  it('ignores process kinds with no defined completion effect yet', () => {
    const state = createInitialState();
    const process: Process = { id: 'p1', kind: 'certification', startedAt: 0, durationMs: 1000, payload: {} };
    const staff = applyCompletedProcesses(state.staff, [process]);
    expect(staff).toBe(state.staff); // unchanged (reduce's identity short-circuit)
  });

  it('folds multiple completions in the same pass', () => {
    const state = createInitialState();
    const processes: Process[] = [
      { id: 'p1', kind: 'training', startedAt: 0, durationMs: 1000, payload: { from: 'technician', to: 'engineer' } },
      { id: 'p2', kind: 'training', startedAt: 0, durationMs: 1000, payload: { from: 'engineer', to: 'scientist' } },
    ];
    const staff = applyCompletedProcesses(state.staff, processes);
    expect(staff.pools.engineer.hired).toBe(1);
    expect(staff.pools.scientist.hired).toBe(1);
  });
});
