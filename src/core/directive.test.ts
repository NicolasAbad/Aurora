import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { currentDirective } from './directive';
import type { GameState } from './types';

describe('currentDirective (UI_SPEC §2h, Sprint 9.5)', () => {
  it('D-01 at game start: no Finance yet, not affordable', () => {
    const state = createInitialState();
    expect(currentDirective(state)).toBe('D-01');
  });

  it('D-02 once Finance is affordable but not built', () => {
    const state = createInitialState();
    state.resources.funding.amount = 200; // Finance costs 150
    expect(currentDirective(state)).toBe('D-02');
  });

  it('D-03 once Finance is built but nobody is hired', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    expect(currentDirective(state)).toBe('D-03');
  });

  it('D-04 once staff is at cap and Crew Quarters is affordable', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 2; // matches STARTING_STAFF_CAP
    state.resources.funding.amount = 200; // Crew Quarters costs 120
    expect(currentDirective(state)).toBe('D-04');
  });

  it('D-05 once R&D Lab is built with no Scientist', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.buildings.rndLab.level = 1;
    state.staff.pools.technician.hired = 1; // clears D-03
    expect(currentDirective(state)).toBe('D-05');
  });

  it('D-06 once Research is flowing with no active node', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.buildings.rndLab.level = 1;
    state.staff.pools.technician.hired = 1;
    state.staff.pools.scientist.hired = 1; // clears D-05
    state.resources.research.amount = 10;
    expect(currentDirective(state)).toBe('D-06');
  });

  it('D-08 once Test Stand is built with no engine certified', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 1;
    state.buildings.testStand.level = 1;
    expect(currentDirective(state)).toBe('D-08');
  });

  it('D-09 once an engine is certified but no sonda has flown', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 1;
    state.buildings.testStand.level = 1;
    state.certifications.engines.probe1.certified = true;
    expect(currentDirective(state)).toBe('D-09');
  });

  it('D-10 once S-2/Kármán is done, flightProgram is researched, and the VAB is not yet built', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 1;
    state.records = ['pastKarman'];
    state.research.completed = ['flightProgram'];
    expect(currentDirective(state)).toBe('D-10');
  });

  // CLAUDE.md rule 13: real bug found alongside T-02's fix. `pastKarman` (S-2 success)
  // only requires the Propulsion tech branch, entirely independent of the Program
  // branch's `flightProgram` node that actually unlocks the Launch complex (where the
  // VAB lives, ComplexTabs.tsx) — a player can reach pastKarman well before researching
  // that far. Without the fix, D-10 would tell them to build a building they can't even
  // see yet.
  it('D-10 does NOT fire on pastKarman alone if the Launch complex is not unlocked yet (real bug, fixed)', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 1;
    state.records = ['pastKarman'];
    expect(state.research.completed.includes('flightProgram')).toBe(false);
    expect(currentDirective(state)).not.toBe('D-10');
  });

  it('D-11 while an Aurora-story pad has an integration in progress', () => {
    const state: GameState = {
      ...createInitialState(),
      buildings: { ...createInitialState().buildings, finance: { level: 1, upgrades: [], starvedIndicator: false, fedStreakMs: 0 } },
    };
    state.staff.pools.technician.hired = 1;
    state.mission.pads.padA = {
      rocketStatus: 'integrating',
      stagesDone: [],
      checklist: state.mission.pads.padA!.checklist,
      confidence: 0,
      committedRoll: null,
    };
    expect(currentDirective(state)).toBe('D-11');
  });

  it('D-12 once Aurora I has succeeded with no contract accepted', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 1;
    state.records = ['firstOrbit'];
    expect(currentDirective(state)).toBe('D-12');
  });

  it('a contract-linked pad mid-build does NOT trigger D-11 (that pad is not an Aurora-story mission)', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.staff.pools.technician.hired = 1;
    state.mission.pads.padA = {
      rocketStatus: 'integrating',
      stagesDone: [],
      checklist: state.mission.pads.padA!.checklist,
      confidence: 0,
      committedRoll: null,
      contractId: 'offer-1',
    };
    expect(currentDirective(state)).not.toBe('D-11');
  });
});
