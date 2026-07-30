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
  releaseStaff,
  startCertification,
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

  // ECONOMY §4 v3.6: Warehouse's Inventory system multiplies cap bonus 1.25x, but only
  // for levels bought AFTER it's owned — never retroactive.
  it('applies capBonus normally without Inventory system', () => {
    const state = createInitialState();
    state.resources.funding.amount = 10_000;
    state.resources.materials.amount = 10_000;
    const result = buyBuildingUpgrade(state.resources, state.buildings, 'warehouse');
    expect(result!.resources.funding.cap).toBe(1500); // 1000 base + 500 bonus
    expect(result!.resources.materials.cap).toBe(500); // 200 base + 300 bonus
  });

  it('scales capBonus 1.25x once Inventory system is owned', () => {
    const state = createInitialState();
    state.resources.funding.amount = 10_000;
    state.resources.materials.amount = 10_000;
    state.buildings.warehouse.upgrades = ['inventorySystem'];
    const result = buyBuildingUpgrade(state.resources, state.buildings, 'warehouse');
    expect(result!.resources.funding.cap).toBe(1625); // 1000 base + 500*1.25 bonus
    expect(result!.resources.materials.cap).toBe(575); // 200 base + 300*1.25 bonus
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
    expect(hireStaff(state.resources, state.staff, [], 0, 'controller')).toBeNull();
  });

  it('allows a tech-gated role once its tech is completed', () => {
    const state = createInitialState();
    state.resources.funding.amount = 1000;
    const result = hireStaff(state.resources, state.staff, ['flightOperations'], 0, 'controller');
    expect(result).not.toBeNull();
  });

  // ECONOMY §3 v4.1 (Sprint 11.5, GDD §2 v2.11): Engineer/Scientist have no direct-hire
  // path at all anymore — refused unconditionally, even with ample Funding and their old
  // unlock tech completed.
  it('refuses Engineer/Scientist unconditionally — promotion-only, no direct-hire path', () => {
    const state = createInitialState();
    state.resources.funding.amount = 100_000;
    expect(hireStaff(state.resources, state.staff, ['basicEngineering'], 10, 'engineer')).toBeNull();
    expect(hireStaff(state.resources, state.staff, ['scientificMethod'], 10, 'scientist')).toBeNull();
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

  // ECONOMY §4 v3.6: Grants desk raises Finance's Technician slot count from 2 to 3.
  it('allows assigning into the extra slot a slot-adding upgrade grants', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 3;
    state.staff.pools.technician.assigned.finance = 2;
    state.buildings.finance.level = 1;
    expect(adjustStaffAssignment(state.staff, 'technician', 'finance', 1, 1)).toBeNull(); // no upgrade: still capped at 2
    const staff = adjustStaffAssignment(state.staff, 'technician', 'finance', 1, 1, ['grantsDesk']);
    expect(staff).not.toBeNull();
    expect(staff!.pools.technician.assigned.finance).toBe(3);
  });
});

describe('releaseStaff — UI_SPEC §4b (Sprint 7.5, staff dismissal)', () => {
  it('releases one unassigned hired unit, no refund', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 2;
    const staff = releaseStaff(state.staff, 'technician');
    expect(staff).not.toBeNull();
    expect(staff!.pools.technician.hired).toBe(1);
  });

  it('unassigns one first if every hired unit is currently assigned somewhere', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 1;
    state.staff.pools.technician.assigned.finance = 1;
    const staff = releaseStaff(state.staff, 'technician');
    expect(staff!.pools.technician.hired).toBe(0);
    expect(staff!.pools.technician.assigned.finance).toBe(0);
  });

  it('prefers releasing an already-unassigned unit over touching an assignment', () => {
    const state = createInitialState();
    state.staff.pools.technician.hired = 2;
    state.staff.pools.technician.assigned.finance = 1; // 1 assigned, 1 free
    const staff = releaseStaff(state.staff, 'technician');
    expect(staff!.pools.technician.hired).toBe(1);
    expect(staff!.pools.technician.assigned.finance).toBe(1); // untouched
  });

  it('no-ops when nothing of this role is hired', () => {
    const state = createInitialState();
    expect(releaseStaff(state.staff, 'scientist')).toBeNull();
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

  // ECONOMY §4 v3.6: Second research track (R&D Lab internal upgrade).
  describe('second research track', () => {
    it('refuses a second node while the first is in progress, without the upgrade', () => {
      const state = createInitialState();
      state.resources.research.amount = 1000;
      state.research.inProgress = {
        id: 'x',
        kind: 'research',
        startedAt: Date.now(),
        durationMs: 1000,
        payload: { nodeId: 'soundingRockets' },
      };
      expect(startResearch(state.resources, state.research, 'aluminum', Date.now(), false)).toBeNull();
    });

    it('starts a second node into secondInProgress once unlocked, leaving the first untouched', () => {
      const state = createInitialState();
      state.resources.research.amount = 1000;
      const first: Process = {
        id: 'x',
        kind: 'research',
        startedAt: 0,
        durationMs: 1000,
        payload: { nodeId: 'soundingRockets' },
      };
      state.research.inProgress = first;
      const now = Date.now();
      const result = startResearch(state.resources, state.research, 'aluminum', now, true);
      expect(result).not.toBeNull();
      expect(result!.research.inProgress).toBe(first);
      expect(result!.research.secondInProgress).toEqual({
        id: 'research-aluminum',
        kind: 'research',
        startedAt: now,
        durationMs: 5 * 60_000,
        payload: { nodeId: 'aluminum' },
      });
    });

    it('refuses a third node once both slots are occupied, even with the upgrade', () => {
      const state = createInitialState();
      state.resources.research.amount = 1000;
      state.research.inProgress = {
        id: 'x',
        kind: 'research',
        startedAt: 0,
        durationMs: 1000,
        payload: { nodeId: 'soundingRockets' },
      };
      state.research.secondInProgress = {
        id: 'y',
        kind: 'research',
        startedAt: 0,
        durationMs: 1000,
        payload: { nodeId: 'aluminum' },
      };
      expect(startResearch(state.resources, state.research, 'basicEngineering', Date.now(), true)).toBeNull();
    });

    it('fills the primary slot first even when the upgrade is owned and both are empty', () => {
      const state = createInitialState();
      state.resources.research.amount = 1000;
      const result = startResearch(state.resources, state.research, 'aluminum', Date.now(), true);
      expect(result!.research.inProgress).not.toBeNull();
      expect(result!.research.secondInProgress).toBeUndefined();
    });
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

describe('startCertification', () => {
  function fundedState() {
    const state = createInitialState();
    state.resources.hardware.amount = 20;
    state.resources.hardware.byTier.aluminum = 20;
    state.resources.propellant.amount = 100;
    state.resources.propellant.cap = 200;
    return state;
  }

  it('starts the first available test (probe1Test1), deducting Hardware+Propellant and setting inProgress', () => {
    const state = fundedState();
    const now = Date.now();
    const result = startCertification(state.resources, state.certifications, 'probe1Test1', 1, false, now);
    expect(result).not.toBeNull();
    expect(result!.resources.hardware.amount).toBe(10); // 20 - 10
    expect(result!.resources.propellant.amount).toBe(50); // 100 - 50
    expect(result!.certifications.inProgress).toEqual({
      id: `certification-probe1Test1-${now}`,
      kind: 'certification',
      startedAt: now,
      durationMs: 25 * 60_000,
      payload: { testId: 'probe1Test1' },
    });
  });

  it('refuses probe1Test2 before probe1Test1 has resolved (sequencing)', () => {
    const state = fundedState();
    expect(startCertification(state.resources, state.certifications, 'probe1Test2', 1, false, Date.now())).toBeNull();
  });

  it('allows probe1Test2 once probe1Test1 has been attempted', () => {
    const state = fundedState();
    state.certifications.engines.probe1.attempted = true;
    const result = startCertification(state.resources, state.certifications, 'probe1Test2', 1, false, Date.now());
    expect(result).not.toBeNull();
  });

  it('refuses probe1Extended before the engine is certified', () => {
    const state = fundedState();
    state.certifications.engines.probe1.attempted = true; // test1 done, not yet certified
    expect(startCertification(state.resources, state.certifications, 'probe1Extended', 1, false, Date.now())).toBeNull();
  });

  it('refuses when something is already testing (one test at a time)', () => {
    const state = fundedState();
    state.certifications.inProgress = {
      id: 'x',
      kind: 'certification',
      startedAt: Date.now(),
      durationMs: 1000,
      payload: { testId: 'probe1Test1' },
    };
    expect(startCertification(state.resources, state.certifications, 'probe1Test1', 1, false, Date.now())).toBeNull();
  });

  it('refuses when Hardware/Propellant cannot cover the cost', () => {
    const state = createInitialState(); // 0 Hardware, 0 Propellant
    expect(startCertification(state.resources, state.certifications, 'probe1Test1', 1, false, Date.now())).toBeNull();
  });

  it('refuses an unknown test id', () => {
    const state = fundedState();
    expect(startCertification(state.resources, state.certifications, 'notARealTest', 1, false, Date.now())).toBeNull();
  });

  it('draws and stores a committedRoll for a probabilistic test (Orbital-1), never redrawn later — rule 12', () => {
    const state = fundedState();
    state.resources.hardware.amount = 25;
    state.resources.propellant.amount = 150;
    const now = Date.now();
    const result = startCertification(state.resources, state.certifications, 'orbital1Base', 1, false, now, () => 0.37);
    expect(result).not.toBeNull();
    expect(result!.certifications.inProgress?.payload).toEqual({ testId: 'orbital1Base', committedRoll: 0.37 });
  });

  it('does NOT draw a committedRoll for a deterministic test (Probe-1)', () => {
    const state = fundedState();
    const result = startCertification(state.resources, state.certifications, 'probe1Test1', 1, false, Date.now(), () => 0.99);
    expect(result!.certifications.inProgress?.payload).toEqual({ testId: 'probe1Test1' });
  });

  it('scales duration by Test Stand level and Instrumentation (ECONOMY §4 v3.5)', () => {
    const state = fundedState();
    const now = Date.now();
    // level 5 -> -12% (0.03 * 4); with Instrumentation stacked -> * 0.75.
    const result = startCertification(state.resources, state.certifications, 'probe1Test1', 5, true, now);
    expect(result!.certifications.inProgress?.durationMs).toBeCloseTo(25 * 60_000 * 0.88 * 0.75);
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
