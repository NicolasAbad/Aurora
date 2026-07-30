import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import {
  applyCompletedAuroraStages,
  applyCompletedAuroraWeather,
  buildingForPad,
  emptyPadMissionState,
  hasAuroraIISuccess,
  launchAuroraMission,
  maybeAutoQueueAuroraStage,
  nextAuroraStageId,
  resolveAuroraChecklist,
  resolveAuroraTick,
  startAuroraWeatherCheck,
  startNextAuroraStage,
} from './auroraMission';
import type { EngineCertificationState, LaunchRecord, MissionState, Process } from './types';

const MIN = 60_000;

function engineState(overrides: Partial<EngineCertificationState> = {}): EngineCertificationState {
  return { attempted: false, certified: false, extendedCertified: false, ...overrides };
}

function mission(overrides: Partial<MissionState> = {}): MissionState {
  return { ...createInitialState().mission, ...overrides };
}

function fundedState() {
  const state = createInitialState();
  state.resources.hardware.amount = 200;
  state.resources.hardware.byTier.aluminum = 200;
  state.resources.hardware.cap = 500;
  state.resources.research.amount = 200;
  state.resources.propellant.amount = 1000;
  state.resources.propellant.cap = 2000;
  return state;
}

// UI_SPEC §3 screen 8 (Sprint 10 task 3): the v1 milestone screen's trigger condition.
describe('hasAuroraIISuccess', () => {
  it('is false with no launches, or an auroraI success only', () => {
    expect(hasAuroraIISuccess([])).toBe(false);
    const auroraI: LaunchRecord = { id: 'l0', padId: 'padA', missionType: 'auroraI', success: true, timestamp: 0 };
    expect(hasAuroraIISuccess([auroraI])).toBe(false);
  });

  it('is false for a failed auroraII attempt, true once one succeeds', () => {
    const failed: LaunchRecord = { id: 'l1', padId: 'padA', missionType: 'auroraII', success: false, timestamp: 0 };
    expect(hasAuroraIISuccess([failed])).toBe(false);
    const success: LaunchRecord = { id: 'l2', padId: 'padA', missionType: 'auroraII', success: true, timestamp: 1 };
    expect(hasAuroraIISuccess([failed, success])).toBe(true);
  });
});

describe('nextAuroraStageId', () => {
  it('starts with structure and ends at null once all 8 are done', () => {
    expect(nextAuroraStageId([])).toBe('structure');
    expect(nextAuroraStageId(['structure'])).toBe('engines');
    expect(
      nextAuroraStageId([
        'structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration', 'padTransfer', 'propellantLoad', 'flightReview',
      ]),
    ).toBeNull();
  });
});

describe('startNextAuroraStage', () => {
  it('starts structure first, paying 30 Hardware, starting a 20-min integration process', () => {
    const state = fundedState();
    const now = 1000;
    const result = startNextAuroraStage(state.resources, mission(), 'padA', [], engineState(), [], [], now);
    expect(result).not.toBeNull();
    expect(result!.resources.hardware.amount).toBe(170); // 200 - 30
    expect(result!.processes).toEqual([
      { id: `aurora-stage-structure-padA-${now}`, kind: 'integration', startedAt: now, durationMs: 20 * MIN, payload: { missionKind: 'auroraI', padId: 'padA', stageId: 'structure' } },
    ]);
    expect(result!.mission.pads.padA?.rocketStatus).toBe('integrating');
  });

  it('refuses the "engines" stage until Orbital-1 is certified', () => {
    const state = fundedState();
    const m = mission({ pads: { padA: { rocketStatus: 'integrating', stagesDone: ['structure'], checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null } } });
    expect(startNextAuroraStage(state.resources, m, 'padA', [], engineState(), [], [], 0)).toBeNull();
    expect(startNextAuroraStage(state.resources, m, 'padA', [], engineState({ certified: true }), [], [], 0)).not.toBeNull();
  });

  it('refuses when a stage is already running for this pad', () => {
    const state = fundedState();
    const running: Process = { id: 'x', kind: 'integration', startedAt: 0, durationMs: 1000, payload: { missionKind: 'auroraI', padId: 'padA', stageId: 'structure' } };
    expect(startNextAuroraStage(state.resources, mission(), 'padA', [running], engineState(), [], [], 0)).toBeNull();
  });

  it('refuses when the cost is unaffordable', () => {
    const state = createInitialState(); // 0 Hardware
    expect(startNextAuroraStage(state.resources, mission(), 'padA', [], engineState(), [], [], 0)).toBeNull();
  });

  it('refuses for a pad that does not exist yet (padB before it is built)', () => {
    const state = fundedState();
    expect(startNextAuroraStage(state.resources, mission(), 'padB', [], engineState(), [], [], 0)).toBeNull();
  });

  it('resolves Flight Review instantly (0 duration): no process, pays 50 Research, marks stagesDone', () => {
    const state = fundedState();
    const stagesDone = ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration', 'padTransfer', 'propellantLoad'];
    const m = mission({ pads: { padA: { rocketStatus: 'on_pad', stagesDone, checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null } } });
    const result = startNextAuroraStage(state.resources, m, 'padA', [], engineState({ certified: true }), [], [], 0);
    expect(result).not.toBeNull();
    expect(result!.resources.research.amount).toBe(150); // 200 - 50
    expect(result!.processes).toEqual([]);
    expect(result!.mission.pads.padA?.stagesDone).toContain('flightReview');
  });

  it('halves the stage duration when a re-integration bonus is pending for this pad', () => {
    const state = fundedState();
    const m = mission({ auroraHalfDurationNext: { padA: true } });
    const result = startNextAuroraStage(state.resources, m, 'padA', [], engineState(), [], [], 0);
    expect(result!.processes[0].durationMs).toBe(10 * MIN); // half of structure's 20 min
  });

  it('halves the propellantLoad stage duration when Auto-refuel is researched (ECONOMY §5 v3.5)', () => {
    const state = fundedState();
    const stagesDone = ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration', 'padTransfer'];
    const m = mission({ pads: { padA: { rocketStatus: 'on_pad', stagesDone, checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null } } });
    const result = startNextAuroraStage(state.resources, m, 'padA', [], engineState({ certified: true }), ['autoRefuel'], [], 0);
    expect(result!.processes[0].durationMs).toBe(1.5 * MIN); // half of propellantLoad's 3 min
  });

  it('stacks the Auto-refuel and re-integration discounts multiplicatively', () => {
    const state = fundedState();
    const stagesDone = ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration', 'padTransfer'];
    const m = mission({
      pads: { padA: { rocketStatus: 'on_pad', stagesDone, checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null } },
      auroraHalfDurationNext: { padA: true },
    });
    const result = startNextAuroraStage(state.resources, m, 'padA', [], engineState({ certified: true }), ['autoRefuel'], [], 0);
    expect(result!.processes[0].durationMs).toBe(0.75 * MIN); // 3 min * 0.5 (re-integration) * 0.5 (auto-refuel)
  });

  it('halves the padTransfer stage duration when Basic logistics is researched (ECONOMY §5 v3.5 follow-up SCOPED UNLOCK)', () => {
    const state = fundedState();
    const stagesDone = ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration'];
    const m = mission({ pads: { padA: { rocketStatus: 'in_vab', stagesDone, checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null } } });
    const modifiers = [{ id: 'research:basicLogistics', source: 'basicLogistics', target: 'transfer.duration', op: 'mult' as const, value: 0.75 }];
    const result = startNextAuroraStage(state.resources, m, 'padA', [], engineState({ certified: true }), [], modifiers, 0);
    expect(result!.processes[0].durationMs).toBe(3.75 * MIN); // 75% of padTransfer's 5 min
  });

  it('does NOT apply the transfer.duration modifier to a non-transfer stage', () => {
    const state = fundedState();
    const modifiers = [{ id: 'research:basicLogistics', source: 'basicLogistics', target: 'transfer.duration', op: 'mult' as const, value: 0.75 }];
    const result = startNextAuroraStage(state.resources, mission(), 'padA', [], engineState(), [], modifiers, 0);
    expect(result!.processes[0].durationMs).toBe(20 * MIN); // structure's full 20 min, unaffected
  });

  // ECONOMY §9 (Sprint 10): Efficient mixtures' -10% Propellant/launch, scoped to the
  // propellantLoad stage's own cost only.
  it('applies Efficient mixtures to the propellantLoad stage cost only', () => {
    const state = fundedState();
    const stagesDone = ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration', 'padTransfer'];
    const m = mission({ pads: { padA: { rocketStatus: 'on_pad', stagesDone, checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null } } });
    const modifiers = [{ id: 'xp:efficientMixtures', source: 'efficientMixtures', target: 'launch.propellant', op: 'mult' as const, value: 0.9 }];
    const result = startNextAuroraStage(state.resources, m, 'padA', [], engineState({ certified: true }), [], modifiers, 0);
    expect(result!.resources.propellant.amount).toBe(1000 - 360); // 400 * 0.9

    // Unaffected: structure's cost is Hardware only, no propellant involved.
    const structureResult = startNextAuroraStage(state.resources, mission(), 'padA', [], engineState(), [], modifiers, 0);
    expect(structureResult!.resources.hardware.amount).toBe(170);
  });

  // ECONOMY §9: Partial reusability — 20% of whatever Propellant the propellantLoad
  // stage just spent is credited straight back.
  it('credits back 20% Propellant at propellantLoad when Partial reusability is owned', () => {
    const state = fundedState();
    const stagesDone = ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration', 'padTransfer'];
    const m = mission({ pads: { padA: { rocketStatus: 'on_pad', stagesDone, checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null } } });
    const result = startNextAuroraStage(state.resources, m, 'padA', [], engineState({ certified: true }), [], [], 0, ['partialReusability']);
    // Spends 400, recovers 400 * 0.2 = 80 -> net -320.
    expect(result!.resources.propellant.amount).toBe(1000 - 400 + 80);
  });

  it('does not recover Propellant for a non-propellantLoad stage even when Partial reusability is owned', () => {
    const state = fundedState();
    const result = startNextAuroraStage(state.resources, mission(), 'padA', [], engineState(), [], [], 0, ['partialReusability']);
    expect(result!.resources.hardware.amount).toBe(170); // unaffected
  });

  // ECONOMY §9: Procedures' -10% integration time, scoped to VAB stages (structure
  // through finalIntegration) — must NOT touch padTransfer/propellantLoad/flightReview.
  it('applies Procedures to a VAB stage but not to padTransfer', () => {
    const state = fundedState();
    const modifiers = [{ id: 'xp:procedures', source: 'procedures', target: 'integration.duration', op: 'mult' as const, value: 0.9 }];
    const structureResult = startNextAuroraStage(state.resources, mission(), 'padA', [], engineState(), [], modifiers, 0);
    expect(structureResult!.processes[0].durationMs).toBe(18 * MIN); // 20 * 0.9

    const stagesDone = ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration'];
    const m = mission({ pads: { padA: { rocketStatus: 'in_vab', stagesDone, checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null } } });
    const transferResult = startNextAuroraStage(state.resources, m, 'padA', [], engineState({ certified: true }), [], modifiers, 0);
    expect(transferResult!.processes[0].durationMs).toBe(5 * MIN); // unaffected
  });

  // ECONOMY §7 (v3.9): orbitalFlight gates the SECOND orbital attempt onward, never
  // Aurora I's own first launch (shipped, tested since Sprint 7 — the doc's old wording
  // was simply wrong, not a bug in this code).
  it('gates a fresh integration on orbitalFlight tech once Aurora I has already succeeded, but not before', () => {
    const state = fundedState();
    const priorSuccess: LaunchRecord = { id: 'l0', padId: 'padA', missionType: 'auroraI', success: true, timestamp: 0 };
    const m = mission({ launches: [priorSuccess] });
    expect(startNextAuroraStage(state.resources, m, 'padA', [], engineState(), [], [], 0)).toBeNull();
    expect(startNextAuroraStage(state.resources, m, 'padA', [], engineState(), ['orbitalFlight'], [], 0)).not.toBeNull();
    // Aurora I's own first attempt (no prior success recorded) is never gated on it.
    expect(startNextAuroraStage(state.resources, mission(), 'padA', [], engineState(), [], [], 0)).not.toBeNull();
  });
});

describe('maybeAutoQueueAuroraStage', () => {
  it('does nothing without vabQueues researched', () => {
    const state = fundedState();
    const result = maybeAutoQueueAuroraStage(state.resources, mission(), 'padA', [], engineState(), [], [], 0);
    expect(result.processes).toEqual([]);
  });

  it('auto-starts a VAB stage once vabQueues is researched', () => {
    const state = fundedState();
    const result = maybeAutoQueueAuroraStage(state.resources, mission(), 'padA', [], engineState(), ['vabQueues'], [], 0);
    expect(result.processes).toHaveLength(1);
    expect(result.processes[0].payload.stageId).toBe('structure');
  });

  it('does NOT auto-start padTransfer even with vabQueues (deliberate manual decision point)', () => {
    const state = fundedState();
    const stagesDone = ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration'];
    const m = mission({ pads: { padA: { rocketStatus: 'in_vab', stagesDone, checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null } } });
    const result = maybeAutoQueueAuroraStage(state.resources, m, 'padA', [], engineState({ certified: true }), ['vabQueues'], [], 0);
    expect(result.processes).toEqual([]);
  });

  // ECONOMY §9 (v3.9): Parallel integration (Flight XP) grants the identical auto-chain
  // effect through a different currency — either route is sufficient on its own.
  it('auto-starts a VAB stage once Parallel integration is owned, with vabQueues NOT researched', () => {
    const state = fundedState();
    const result = maybeAutoQueueAuroraStage(state.resources, mission(), 'padA', [], engineState(), [], [], 0, ['parallelIntegration']);
    expect(result.processes).toHaveLength(1);
    expect(result.processes[0].payload.stageId).toBe('structure');
  });
});

describe('applyCompletedAuroraStages', () => {
  it('pushes the completed stage and sets rocketStatus to in_vab after finalIntegration', () => {
    const stagesDone = ['structure', 'engines', 'guidance', 'satellitePayload'];
    const m = mission({ pads: { padA: { rocketStatus: 'integrating', stagesDone, checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null } } });
    const completed: Process[] = [{ id: 'p1', kind: 'integration', startedAt: 0, durationMs: 0, payload: { missionKind: 'auroraI', padId: 'padA', stageId: 'finalIntegration' } }];
    const result = applyCompletedAuroraStages(m, completed);
    expect(result.pads.padA?.stagesDone).toContain('finalIntegration');
    expect(result.pads.padA?.rocketStatus).toBe('in_vab');
  });

  it('sets rocketStatus to on_pad after padTransfer', () => {
    const m = mission({ pads: { padA: { rocketStatus: 'transferring', stagesDone: [], checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null } } });
    const completed: Process[] = [{ id: 'p1', kind: 'integration', startedAt: 0, durationMs: 0, payload: { missionKind: 'auroraI', padId: 'padA', stageId: 'padTransfer' } }];
    const result = applyCompletedAuroraStages(m, completed);
    expect(result.pads.padA?.rocketStatus).toBe('on_pad');
  });

  it('ignores processes for other mission kinds', () => {
    const m = mission();
    const completed: Process[] = [{ id: 'p1', kind: 'certification', startedAt: 0, durationMs: 0, payload: { testId: 'x' } }];
    expect(applyCompletedAuroraStages(m, completed)).toBe(m);
  });
});

describe('startAuroraWeatherCheck / applyCompletedAuroraWeather', () => {
  it('starts a weather process with a random duration in [2,5] min, then flips the checklist item once completed', () => {
    const started = startAuroraWeatherCheck(mission(), 'padA', [], 0, () => 0.5);
    expect(started).not.toBeNull();
    expect(started!.processes[0].durationMs).toBe(3.5 * MIN);

    const resolved = applyCompletedAuroraWeather(mission(), [
      { id: started!.processes[0].id, kind: 'weather_window', startedAt: 0, durationMs: 3.5 * MIN, payload: { missionKind: 'auroraI', padId: 'padA' } },
    ]);
    expect(resolved.pads.padA?.checklist.weatherWindow).toBe(true);
  });

  it('refuses a second weather check while one is already running', () => {
    const running: Process = { id: 'w1', kind: 'weather_window', startedAt: 0, durationMs: 1000, payload: { missionKind: 'auroraI', padId: 'padA' } };
    expect(startAuroraWeatherCheck(mission(), 'padA', [running], 0)).toBeNull();
  });
});

describe('resolveAuroraChecklist (Option A: all 8 mandatory)', () => {
  function completeStagesPad() {
    return {
      rocketStatus: 'on_pad' as const,
      stagesDone: ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration', 'padTransfer', 'propellantLoad', 'flightReview'],
      checklist: mission().pads.padA!.checklist,
      confidence: 0,
      committedRoll: null,
    };
  }

  it('does not commit while any item is still pending (e.g. Controllers unstaffed)', () => {
    const state = createInitialState();
    state.buildings.trackingStation.level = 1;
    const m = mission({ pads: { padA: { ...completeStagesPad(), checklist: { ...completeStagesPad().checklist, weatherWindow: true } } } });
    const result = resolveAuroraChecklist(m, 'padA', state.buildings, state.staff, engineState({ certified: true }), 0);
    expect(result.pads.padA?.committedRoll).toBeNull();
    expect(result.pads.padA?.checklist.controllersOnStation).toBe(false);
  });

  it('commits a roll the instant all 8 items are simultaneously true', () => {
    const state = createInitialState();
    state.buildings.trackingStation.level = 1;
    state.buildings.launchControl.level = 1;
    state.staff.pools.controller.hired = 3;
    state.staff.pools.controller.assigned.launchControl = 3; // 3/3 slots, fully staffed
    const m = mission({ pads: { padA: { ...completeStagesPad(), checklist: { ...completeStagesPad().checklist, weatherWindow: true } } } });

    const result = resolveAuroraChecklist(m, 'padA', state.buildings, state.staff, engineState({ certified: true, extendedCertified: true }), 0, () => 0.11);
    expect(result.pads.padA?.committedRoll).toBe(0.11);
    expect(result.pads.padA?.confidence).toBe(100); // extended cert alone reaches 100 once all 8 are done
  });

  it('is a no-op once committedRoll is already set (frozen)', () => {
    const state = createInitialState();
    const committed = mission({ pads: { padA: { ...completeStagesPad(), committedRoll: 0.5 } } });
    const result = resolveAuroraChecklist(committed, 'padA', state.buildings, state.staff, engineState(), 0);
    expect(result).toBe(committed);
  });
});

describe('launchAuroraMission', () => {
  function committedMission(committedRoll: number, confidence = 90) {
    return mission({
      pads: {
        padA: {
          rocketStatus: 'on_pad',
          stagesDone: ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration', 'padTransfer', 'propellantLoad', 'flightReview'],
          checklist: mission().pads.padA!.checklist,
          confidence,
          committedRoll,
        },
      },
    });
  }

  it('refuses without a mission on this pad or before a roll is committed', () => {
    const state = createInitialState();
    expect(launchAuroraMission(state.resources, mission(), 'padA', [], [], 0)).toBeNull();
    expect(launchAuroraMission(state.resources, mission(), 'padB', [], [], 0)).toBeNull();
  });

  it('success: grants Aurora I reward, narrates N-11, resets the pad, logs the launch, auroraISuccess becomes derivable', () => {
    const state = createInitialState();
    const m = committedMission(0.5, 90); // 0.5 < 0.9 -> success
    const result = launchAuroraMission(state.resources, m, 'padA', [], [], 5000);
    expect(result).not.toBeNull();
    expect(result!.resources.flightxp.amount).toBe(250);
    expect(result!.resources.reputation.amount).toBe(60);
    expect(result!.resources.research.amount).toBe(2000);
    expect(result!.narrativeSeen).toEqual(['N-11']);
    expect(result!.mission.pads.padA).toEqual({ rocketStatus: 'none', stagesDone: [], checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null });
    expect(result!.mission.launches).toEqual([{ id: 'aurora-launch-padA-5000', padId: 'padA', missionType: 'auroraI', success: true, timestamp: 5000 }]);
    expect(result!.mission.auroraHalfDurationNext?.padA).toBe(false);
  });

  // ECONOMY §4/§9 (Sprint 10): Tracking Station's per-level Flight XP multiplier and
  // Public relations' 'reputation.gain' modifier both apply to a story-mission launch.
  it('success: scales Flight XP by Tracking Station level and Reputation by Public relations', () => {
    const state = createInitialState();
    const m = committedMission(0.5, 90);
    const modifiers = [{ id: 'xp:publicRelations', source: 'publicRelations', target: 'reputation.gain', op: 'mult' as const, value: 1.2 }];
    const result = launchAuroraMission(state.resources, m, 'padA', [], [], 5000, modifiers, 1, false);
    expect(result!.resources.flightxp.amount).toBe(250 * 1.25); // Tracking Station level 1: +25%
    expect(result!.resources.reputation.amount).toBe(60 * 1.2);
  });

  it('failure: 80%/60% XP/Flight-Data, 60% recovery of the 90 H actually spent integrating, no Rep, narrates N-12, sets the re-integration bonus', () => {
    const state = createInitialState();
    state.resources.hardware.amount = 0;
    const m = committedMission(0.95, 90); // 0.95 >= 0.9 -> failure
    const result = launchAuroraMission(state.resources, m, 'padA', [], [], 5000);
    expect(result!.resources.flightxp.amount).toBe(200); // 80% of 250
    expect(result!.resources.reputation.amount).toBe(0);
    expect(result!.resources.research.amount).toBe(1200); // 60% of 2000
    expect(result!.resources.hardware.amount).toBe(54); // 60% of 90 (30+20+15+15+10 across the 5 VAB stages)
    expect(result!.narrativeSeen).toEqual(['N-12']);
    expect(result!.mission.auroraHalfDurationNext?.padA).toBe(true);
  });

  // ECONOMY §7 (v3.9): Aurora II reuses Aurora I's mechanics wholesale — same reward,
  // same failure package — only the missionType tag and narrative beat differ, keyed off
  // whether a successful 'auroraI' launch already exists in history.
  describe('Aurora II (v3.9)', () => {
    function withPriorSuccess(committedRoll: number, confidence = 90) {
      const priorSuccess: LaunchRecord = { id: 'l0', padId: 'padA', missionType: 'auroraI', success: true, timestamp: 0 };
      return { ...committedMission(committedRoll, confidence), launches: [priorSuccess] };
    }

    it('success after a prior Aurora I success: tags "auroraII", narrates N-16 not N-11', () => {
      const state = createInitialState();
      const m = withPriorSuccess(0.5, 90); // success
      const result = launchAuroraMission(state.resources, m, 'padA', [], [], 5000);
      expect(result!.narrativeSeen).toEqual(['N-16']);
      expect(result!.mission.launches.at(-1)).toEqual({
        id: 'aurora-launch-padA-5000', padId: 'padA', missionType: 'auroraII', success: true, timestamp: 5000,
      });
    });

    it('a failed second-or-later attempt is still tagged "auroraII", same failure narrative (N-12)', () => {
      const state = createInitialState();
      state.resources.hardware.amount = 0;
      const m = withPriorSuccess(0.95, 90); // failure
      const result = launchAuroraMission(state.resources, m, 'padA', [], [], 5000);
      expect(result!.mission.launches.at(-1)?.missionType).toBe('auroraII');
      expect(result!.narrativeSeen).toEqual(['N-12']);
    });
  });
});

describe('buildingForPad (Sprint 9)', () => {
  it('maps padA to launchPad and padB to launchPadB', () => {
    expect(buildingForPad('padA')).toBe('launchPad');
    expect(buildingForPad('padB')).toBe('launchPadB');
  });
});

describe('Sprint 9: Aurora functions skip a contract-linked pad', () => {
  function contractPad() {
    return { ...emptyPadMissionState(), contractId: 'contract-1-0', rocketStatus: 'none' as const };
  }

  it('startNextAuroraStage refuses a pad owned by a contract mission', () => {
    const state = fundedState();
    const m = mission({ pads: { padA: contractPad() } });
    expect(startNextAuroraStage(state.resources, m, 'padA', [], engineState(), [], [], 0)).toBeNull();
  });

  it('resolveAuroraChecklist is a no-op for a pad owned by a contract mission', () => {
    const state = createInitialState();
    const m = mission({ pads: { padA: { ...contractPad(), stagesDone: ['payloadIntegration'] } } });
    const result = resolveAuroraChecklist(m, 'padA', state.buildings, state.staff, engineState(), 0);
    expect(result).toBe(m);
  });

  it('launchAuroraMission refuses a pad owned by a contract mission even if committedRoll happens to be set', () => {
    const state = createInitialState();
    const m = mission({ pads: { padA: { ...contractPad(), committedRoll: 0.1, confidence: 90 } } });
    expect(launchAuroraMission(state.resources, m, 'padA', [], [], 0)).toBeNull();
  });
});

describe('resolveAuroraTick (per-tick composition)', () => {
  it('applies a completed stage, auto-queues the next one under vabQueues, and only iterates pads that exist', () => {
    const state = fundedState();
    state.research.completed = ['vabQueues'];
    const m = mission({
      pads: {
        padA: { rocketStatus: 'integrating', stagesDone: [], checklist: mission().pads.padA!.checklist, confidence: 0, committedRoll: null },
      },
    });
    const completed: Process[] = [
      { id: 'p1', kind: 'integration', startedAt: 0, durationMs: 0, payload: { missionKind: 'auroraI', padId: 'padA', stageId: 'structure' } },
    ];

    const result = resolveAuroraTick(
      state.resources, m, state.buildings, state.staff, engineState(), 0, state.research.completed, [], [], completed, 1000,
    );

    expect(result.mission.pads.padA?.stagesDone).toEqual(['structure']);
    // vabQueues auto-started 'engines' right away — but engines needs Orbital-1
    // certified, so with an uncertified engine it should NOT have started.
    expect(result.processes).toEqual([]);
  });

  it('resolves the checklist (commits a roll) once auto-queued processes bring every item true', () => {
    const state = fundedState();
    state.buildings.trackingStation.level = 1;
    state.buildings.launchControl.level = 1;
    state.staff.pools.controller.hired = 3;
    state.staff.pools.controller.assigned.launchControl = 3;
    const pad = {
      rocketStatus: 'on_pad' as const,
      stagesDone: ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration', 'padTransfer', 'propellantLoad', 'flightReview'],
      checklist: { ...mission().pads.padA!.checklist, weatherWindow: true },
      confidence: 0,
      committedRoll: null,
    };
    const m = mission({ pads: { padA: pad } });

    const result = resolveAuroraTick(
      state.resources, m, state.buildings, state.staff, engineState({ certified: true }), 0, [], [], [], [], 1000,
    );
    expect(result.mission.pads.padA?.committedRoll).not.toBeNull();
  });
});
