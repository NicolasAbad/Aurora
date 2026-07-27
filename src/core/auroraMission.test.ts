import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import {
  applyCompletedAuroraStages,
  applyCompletedAuroraWeather,
  launchAuroraMission,
  maybeAutoQueueAuroraStage,
  nextAuroraStageId,
  resolveAuroraChecklist,
  resolveAuroraTick,
  startAuroraWeatherCheck,
  startNextAuroraStage,
} from './auroraMission';
import type { EngineCertificationState, MissionState, Process } from './types';

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
