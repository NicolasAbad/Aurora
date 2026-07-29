import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import {
  applyCompletedSoundingProcesses,
  computeSondaConfidence,
  isSoundingRocketUnlocked,
  launchSoundingMission,
  paySoundingFlightReview,
  resolveSoundingChecklist,
  startSoundingAssembly,
  startSoundingWeatherCheck,
} from './soundingMission';
import type { EngineCertificationState, MissionState, Process, SoundingMissionState } from './types';

const MIN = 60_000;

function engineState(overrides: Partial<EngineCertificationState> = {}): EngineCertificationState {
  return { attempted: false, certified: false, extendedCertified: false, ...overrides };
}

function mission(overrides: Partial<MissionState> = {}): MissionState {
  return { ...createInitialState().mission, ...overrides };
}

describe('isSoundingRocketUnlocked', () => {
  it('S-1 requires probe1Engine tech, nothing else', () => {
    expect(isSoundingRocketUnlocked('s1', [], false)).toBe(false);
    expect(isSoundingRocketUnlocked('s1', ['probe1Engine'], false)).toBe(true);
  });

  it('S-2 additionally requires Extended Rail', () => {
    expect(isSoundingRocketUnlocked('s2', ['probe1Engine'], false)).toBe(false);
    expect(isSoundingRocketUnlocked('s2', ['probe1Engine'], true)).toBe(true);
  });
});

describe('computeSondaConfidence', () => {
  it('base 65 + weather 5 = 70 with no certification', () => {
    expect(computeSondaConfidence(engineState())).toBe(70);
  });

  it('base + standard cert + weather = 90', () => {
    expect(computeSondaConfidence(engineState({ attempted: true, certified: true }))).toBe(90);
  });

  it('base + extended cert + weather = 100 exactly, guaranteed (ECONOMY §7a)', () => {
    expect(
      computeSondaConfidence(engineState({ attempted: true, certified: true, extendedCertified: true })),
    ).toBe(100);
  });
});

describe('startSoundingAssembly', () => {
  const completedTech = ['probe1Engine'];

  it('refuses when a mission is already in flight', () => {
    const m = mission({ sounding: { rocketId: 's1', contractId: null, checklist: { assembled: false, propellantReady: false, weatherWindow: false, flightReview: true }, confidence: 70, committedRoll: null } });
    const state = createInitialState();
    const result = startSoundingAssembly(
      state.resources, m, completedTech, true, true, false, engineState(), [], 's1', null, 0,
    );
    expect(result).toBeNull();
  });

  it('refuses without the Test Stand or Launch Rail built', () => {
    const state = createInitialState();
    state.resources.hardware.amount = 100;
    expect(
      startSoundingAssembly(state.resources, mission(), completedTech, false, true, false, engineState(), [], 's1', null, 0),
    ).toBeNull();
    expect(
      startSoundingAssembly(state.resources, mission(), completedTech, true, false, false, engineState(), [], 's1', null, 0),
    ).toBeNull();
  });

  it('refuses S-2 without Extended Rail, and refuses a contract-linked S-2 outright', () => {
    const state = createInitialState();
    state.resources.hardware.amount = 100;
    expect(
      startSoundingAssembly(state.resources, mission(), completedTech, true, true, false, engineState(), [], 's2', null, 0),
    ).toBeNull();
    expect(
      startSoundingAssembly(state.resources, mission(), completedTech, true, true, true, engineState(), [], 's2', 'contract-0-1', 0),
    ).toBeNull(); // tier-0 only ever flies an S-1 (ECONOMY §10)
  });

  it('refuses when Hardware is short', () => {
    const state = createInitialState();
    state.resources.hardware.amount = 2;
    expect(
      startSoundingAssembly(state.resources, mission(), completedTech, true, true, false, engineState(), [], 's1', null, 0),
    ).toBeNull();
  });

  it('pays 8 Hardware, starts a 10-min integration process, and opens the mission slot at S-1 defaults', () => {
    const state = createInitialState();
    state.resources.hardware.amount = 8;
    state.resources.hardware.byTier.aluminum = 8;
    const result = startSoundingAssembly(
      state.resources, mission(), completedTech, true, true, false, engineState(), [], 's1', null, 1000,
    );

    expect(result).not.toBeNull();
    expect(result!.resources.hardware.amount).toBe(0);
    expect(result!.processes).toEqual([
      { id: 'sounding-assembly-s1-1000', kind: 'integration', startedAt: 1000, durationMs: 10 * MIN, payload: { missionKind: 'sounding', rocketId: 's1', checklistItem: 'assembled' } },
    ]);
    expect(result!.mission.sounding).toEqual({
      rocketId: 's1',
      contractId: null,
      checklist: { assembled: false, propellantReady: false, weatherWindow: false, flightReview: true },
      confidence: 70,
      committedRoll: null,
    });
  });

  it('a contract-linked S-1 costs +2 Hardware (10 total, ECONOMY §10 all-inclusive)', () => {
    const state = createInitialState();
    state.resources.hardware.amount = 10;
    state.resources.hardware.byTier.aluminum = 10;
    const result = startSoundingAssembly(
      state.resources, mission(), completedTech, true, true, false, engineState(), [], 's1', 'contract-0-1', 1000,
    );
    expect(result).not.toBeNull();
    expect(result!.resources.hardware.amount).toBe(0);
    expect(result!.mission.sounding?.contractId).toBe('contract-0-1');
  });

  it('halves the assembly duration when a re-integration bonus is pending, and consumes it', () => {
    const state = createInitialState();
    state.resources.hardware.amount = 8;
    const m = mission({ soundingHalfDurationNext: { s1: true } });
    const result = startSoundingAssembly(
      state.resources, m, completedTech, true, true, false, engineState(), [], 's1', null, 0,
    );
    expect(result!.processes[0].durationMs).toBe(5 * MIN);
    expect(result!.mission.soundingHalfDurationNext.s1).toBe(false);
  });
});

describe('applyCompletedSoundingProcesses', () => {
  it('flips the matching checklist item for a completed sounding process', () => {
    const m = mission({
      sounding: {
        rocketId: 's1', contractId: null,
        checklist: { assembled: false, propellantReady: false, weatherWindow: false, flightReview: true },
        confidence: 70, committedRoll: null,
      },
    });
    const completed: Process[] = [
      { id: 'p1', kind: 'integration', startedAt: 0, durationMs: 0, payload: { missionKind: 'sounding', rocketId: 's1', checklistItem: 'assembled' } },
    ];
    const result = applyCompletedSoundingProcesses(m, completed);
    expect(result.sounding?.checklist.assembled).toBe(true);
    expect(result.sounding?.checklist.weatherWindow).toBe(false);
  });

  it('ignores processes tagged for a different mission kind', () => {
    const m = mission({
      sounding: {
        rocketId: 's1', contractId: null,
        checklist: { assembled: false, propellantReady: false, weatherWindow: false, flightReview: true },
        confidence: 70, committedRoll: null,
      },
    });
    const completed: Process[] = [
      { id: 'p1', kind: 'research', startedAt: 0, durationMs: 0, payload: { nodeId: 'aluminum' } },
    ];
    const result = applyCompletedSoundingProcesses(m, completed);
    expect(result).toBe(m); // no change, same reference
  });

  it('no-ops when there is no mission in progress', () => {
    const m = mission();
    const completed: Process[] = [
      { id: 'p1', kind: 'integration', startedAt: 0, durationMs: 0, payload: { missionKind: 'sounding', rocketId: 's1', checklistItem: 'assembled' } },
    ];
    expect(applyCompletedSoundingProcesses(m, completed)).toBe(m);
  });
});

describe('startSoundingWeatherCheck', () => {
  it('refuses without a mission, when already resolved, or when already running', () => {
    expect(startSoundingWeatherCheck(mission(), [], 0)).toBeNull();

    const doneMission = mission({
      sounding: { rocketId: 's1', contractId: null, checklist: { assembled: false, propellantReady: false, weatherWindow: true, flightReview: true }, confidence: 70, committedRoll: null },
    });
    expect(startSoundingWeatherCheck(doneMission, [], 0)).toBeNull();

    const inFlightMission = mission({
      sounding: { rocketId: 's1', contractId: null, checklist: { assembled: false, propellantReady: false, weatherWindow: false, flightReview: true }, confidence: 70, committedRoll: null },
    });
    const runningProcess: Process = { id: 'w1', kind: 'weather_window', startedAt: 0, durationMs: 2 * MIN, payload: { missionKind: 'sounding' } };
    expect(startSoundingWeatherCheck(inFlightMission, [runningProcess], 0)).toBeNull();
  });

  it('starts a process with a duration inside the uniform 2-5 min range (ECONOMY §11)', () => {
    const m = mission({
      sounding: { rocketId: 's1', contractId: null, checklist: { assembled: false, propellantReady: false, weatherWindow: false, flightReview: true }, confidence: 70, committedRoll: null },
    });
    const result = startSoundingWeatherCheck(m, [], 5000, () => 0.5); // midpoint
    expect(result).not.toBeNull();
    expect(result!.processes[0].durationMs).toBe(3.5 * MIN);
    expect(result!.processes[0].kind).toBe('weather_window');
  });
});

describe('paySoundingFlightReview', () => {
  it('refuses outside an S-2 mission, if already paid, or if Research is short', () => {
    const state = createInitialState();
    state.resources.research.amount = 100;

    expect(paySoundingFlightReview(state.resources, mission())).toBeNull(); // no mission

    const s1Mission = mission({
      sounding: { rocketId: 's1', contractId: null, checklist: { assembled: false, propellantReady: false, weatherWindow: false, flightReview: true }, confidence: 70, committedRoll: null },
    });
    expect(paySoundingFlightReview(state.resources, s1Mission)).toBeNull(); // S-1 has nothing to pay

    const shortState = createInitialState();
    shortState.resources.research.amount = 5;
    const s2Mission = mission({
      sounding: { rocketId: 's2', contractId: null, checklist: { assembled: false, propellantReady: false, weatherWindow: false, flightReview: false }, confidence: 65, committedRoll: null },
    });
    expect(paySoundingFlightReview(shortState.resources, s2Mission)).toBeNull();
  });

  it('deducts 20 Research and flips flightReview true for an S-2 mission', () => {
    const state = createInitialState();
    state.resources.research.amount = 100;
    const s2Mission = mission({
      sounding: { rocketId: 's2', contractId: null, checklist: { assembled: false, propellantReady: false, weatherWindow: false, flightReview: false }, confidence: 65, committedRoll: null },
    });
    const result = paySoundingFlightReview(state.resources, s2Mission);
    expect(result).not.toBeNull();
    expect(result!.resources.research.amount).toBe(80);
    expect(result!.mission.sounding?.checklist.flightReview).toBe(true);
  });
});

describe('resolveSoundingChecklist', () => {
  it('no-ops with no mission or once a roll is already committed', () => {
    expect(resolveSoundingChecklist(mission(), createInitialState().resources, engineState())).toEqual(mission());

    const committed = mission({
      sounding: { rocketId: 's1', contractId: null, checklist: { assembled: true, propellantReady: true, weatherWindow: true, flightReview: true }, confidence: 70, committedRoll: 0.5 },
    });
    expect(resolveSoundingChecklist(committed, createInitialState().resources, engineState())).toBe(committed);
  });

  it('live-recomputes propellantReady and confidence without committing while incomplete', () => {
    const state = createInitialState();
    state.resources.propellant.amount = 100;
    const m = mission({
      sounding: { rocketId: 's1', contractId: null, checklist: { assembled: true, propellantReady: false, weatherWindow: false, flightReview: true }, confidence: 0, committedRoll: null },
    });
    const result = resolveSoundingChecklist(m, state.resources, engineState({ certified: true, attempted: true }));
    expect(result.sounding?.checklist.propellantReady).toBe(true);
    expect(result.sounding?.confidence).toBe(90);
    expect(result.sounding?.committedRoll).toBeNull(); // weatherWindow still false
  });

  it('commits a roll the instant every item is simultaneously true (rule 12)', () => {
    const state = createInitialState();
    state.resources.propellant.amount = 100;
    const m = mission({
      sounding: { rocketId: 's1', contractId: null, checklist: { assembled: true, propellantReady: false, weatherWindow: true, flightReview: true }, confidence: 0, committedRoll: null },
    });
    const result = resolveSoundingChecklist(m, state.resources, engineState(), () => 0.42);
    expect(result.sounding?.committedRoll).toBe(0.42);
  });

  it('an S-2 mission also needs propellant for its (contract-free) requirement, and flightReview gates completion', () => {
    const state = createInitialState();
    state.resources.propellant.amount = 100;
    const m = mission({
      sounding: { rocketId: 's2', contractId: null, checklist: { assembled: true, propellantReady: false, weatherWindow: true, flightReview: false }, confidence: 0, committedRoll: null },
    });
    const result = resolveSoundingChecklist(m, state.resources, engineState(), () => 0.1);
    expect(result.sounding?.checklist.propellantReady).toBe(true);
    expect(result.sounding?.committedRoll).toBeNull(); // flightReview still false
  });
});

describe('launchSoundingMission', () => {
  function completeMission(overrides: Partial<SoundingMissionState> = {}) {
    return mission({
      sounding: {
        rocketId: 's1', contractId: null,
        checklist: { assembled: true, propellantReady: true, weatherWindow: true, flightReview: true },
        confidence: 90, committedRoll: 0.5,
        ...overrides,
      },
    });
  }

  it('refuses without a mission or before a roll is committed', () => {
    const state = createInitialState();
    expect(launchSoundingMission(state.resources, mission(), state.contracts, [], [], 0)).toBeNull();
    const uncommitted = mission({
      sounding: { rocketId: 's1', contractId: null, checklist: { assembled: true, propellantReady: true, weatherWindow: false, flightReview: true }, confidence: 70, committedRoll: null },
    });
    expect(launchSoundingMission(state.resources, uncommitted, state.contracts, [], [], 0)).toBeNull();
  });

  it('success (roll under confidence): grants S-1 rewards, narrates N-08b, resets the mission slot, logs the launch', () => {
    const state = createInitialState();
    state.resources.propellant.amount = 100;
    const m = completeMission({ committedRoll: 0.5, confidence: 90 }); // 0.5 < 0.90 -> success

    const result = launchSoundingMission(state.resources, m, state.contracts, [], [], 5000);
    expect(result).not.toBeNull();
    expect(result!.resources.flightxp.amount).toBe(15);
    expect(result!.resources.reputation.amount).toBe(1);
    expect(result!.resources.research.amount).toBe(200);
    expect(result!.resources.propellant.amount).toBe(70); // 100 - 30
    expect(result!.narrativeSeen).toEqual(['N-08b']);
    expect(result!.mission.sounding).toBeNull();
    expect(result!.mission.launches).toEqual([
      { id: 'sounding-launch-s1-5000', padId: null, missionType: 's1', success: true, timestamp: 5000 },
    ]);
    expect(result!.mission.soundingHalfDurationNext.s1).toBe(false);
  });

  it('failure (roll over confidence): 80% XP, 60% Flight Data, 60% Hardware recovery, no Rep, sets the re-integration bonus', () => {
    const state = createInitialState();
    state.resources.propellant.amount = 100;
    state.resources.hardware.amount = 0;
    const m = completeMission({ committedRoll: 0.95, confidence: 90 }); // 0.95 >= 0.90 -> failure

    const result = launchSoundingMission(state.resources, m, state.contracts, [], [], 5000);
    expect(result).not.toBeNull();
    expect(result!.resources.flightxp.amount).toBe(12); // 80% of 15
    expect(result!.resources.reputation.amount).toBe(0);
    expect(result!.resources.research.amount).toBe(120); // 60% of 200
    expect(result!.resources.hardware.amount).toBe(4.8); // 60% of 8 assembly Hardware
    expect(result!.mission.launches[0].success).toBe(false);
    expect(result!.mission.soundingHalfDurationNext.s1).toBe(true);
  });

  it('a successful contract-linked flight also fulfills the contract and pays its reward', () => {
    const state = createInitialState();
    state.resources.propellant.amount = 100;
    const contracts = {
      offers: [{ id: 'contract-0-1', tier: 0 as const, client: 'Test Client', offeredAt: 0, deadlineMs: 999999 }],
      active: [{ offerId: 'contract-0-1', acceptedAt: 0, padId: null, fulfilled: false }],
    };
    const m = completeMission({ committedRoll: 0.1, confidence: 90, contractId: 'contract-0-1' });

    const result = launchSoundingMission(state.resources, m, contracts, [], [], 5000);
    expect(result!.contracts.active[0].fulfilled).toBe(true);
    expect(result!.resources.funding.amount).toBe(400);
    expect(result!.resources.reputation.amount).toBe(1 + 3); // flight's own +1, contract's +3
    expect(result!.resources.propellant.amount).toBe(60); // 100 - 40 (30 + 10 payload extra)
    // ECONOMY §8 "Contract fulfilled": +40 Flight XP / +450 Flight Data, ON TOP of the
    // S-1 flight's own 15 XP / 200 Flight Data.
    expect(result!.resources.flightxp.amount).toBe(15 + 40);
    expect(result!.resources.research.amount).toBe(200 + 450);
    expect(result!.mission.launches[0].contractId).toBe('contract-0-1');
  });

  // ECONOMY §9 (Sprint 10): Trusted brand's +25% contract pay (funding only), Public
  // relations' +20% reputation.gain, Efficient mixtures' -10% Propellant, and Tracking
  // Station's Flight XP multiplier — all applied at once on a contract-linked launch.
  it('applies Trusted brand, Public relations, Efficient mixtures, and Tracking Station together', () => {
    const state = createInitialState();
    state.resources.propellant.amount = 100;
    const contracts = {
      offers: [{ id: 'contract-0-1', tier: 0 as const, client: 'Test Client', offeredAt: 0, deadlineMs: 999999 }],
      active: [{ offerId: 'contract-0-1', acceptedAt: 0, padId: null, fulfilled: false }],
    };
    const m = completeMission({ committedRoll: 0.1, confidence: 90, contractId: 'contract-0-1' });
    const modifiers = [
      { id: 'xp:trustedBrand', source: 'trustedBrand', target: 'contract.pay', op: 'mult' as const, value: 1.25 },
      { id: 'xp:publicRelations', source: 'publicRelations', target: 'reputation.gain', op: 'mult' as const, value: 1.2 },
      { id: 'xp:efficientMixtures', source: 'efficientMixtures', target: 'launch.propellant', op: 'mult' as const, value: 0.9 },
    ];

    const result = launchSoundingMission(state.resources, m, contracts, [], [], 5000, modifiers, [], 1, false);
    expect(result!.resources.funding.amount).toBe(400 * 1.25); // Trusted brand: funding only
    expect(result!.resources.reputation.amount).toBe((1 + 3) * 1.2); // flight's + contract's Rep, both scaled
    expect(result!.resources.flightxp.amount).toBe((15 + 40) * 1.25); // Tracking Station level 1: +25%
    expect(result!.resources.propellant.amount).toBe(100 - 40 * 0.9); // Efficient mixtures -10%
  });

  it('a failed contract-linked flight leaves the contract active and unfulfilled', () => {
    const state = createInitialState();
    state.resources.propellant.amount = 100;
    const contracts = {
      offers: [{ id: 'contract-0-1', tier: 0 as const, client: 'Test Client', offeredAt: 0, deadlineMs: 999999 }],
      active: [{ offerId: 'contract-0-1', acceptedAt: 0, padId: null, fulfilled: false }],
    };
    const m = completeMission({ committedRoll: 0.99, confidence: 90, contractId: 'contract-0-1' });

    const result = launchSoundingMission(state.resources, m, contracts, [], [], 5000);
    expect(result!.contracts.active[0].fulfilled).toBe(false);
    expect(result!.resources.funding.amount).toBe(0);
  });
});
