import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/initialState';
import { CONTRACT_TIERS, SATELLITE_BUILD } from '../data/contracts';
import { emptyPadMissionState } from './auroraMission';
import {
  applyCompletedContractStages,
  launchContractMission,
  resolveContractChecklist,
  startNextContractStage,
} from './contractMission';
import type { ActiveContract, ContractOffer, ContractState, EngineCertificationState, MissionState, PadMissionState, Process } from './types';

const MIN = 60_000;

function engineState(overrides: Partial<EngineCertificationState> = {}): EngineCertificationState {
  return { attempted: false, certified: false, extendedCertified: false, ...overrides };
}

function mission(overrides: Partial<MissionState> = {}): MissionState {
  return { ...createInitialState().mission, ...overrides };
}

function tier1Offer(overrides: Partial<ContractOffer> = {}): ContractOffer {
  return { id: 'contract-1-0', tier: 1, client: 'TerraWatch Inc.', offeredAt: 0, deadlineMs: 8 * 60 * 60_000, ...overrides };
}

function tier2Offer(overrides: Partial<ContractOffer> = {}): ContractOffer {
  return { id: 'contract-2-0', tier: 2, client: 'LinkSphere', offeredAt: 0, deadlineMs: 8 * 60 * 60_000, ...overrides };
}

function activeContract(offerId: string, overrides: Partial<ActiveContract> = {}): ActiveContract {
  return { offerId, acceptedAt: 0, padId: null, fulfilled: false, ...overrides };
}

function contractsWith(offers: ContractOffer[], active: ActiveContract[]): ContractState {
  return { offers, active };
}

function fundedResources() {
  const state = createInitialState();
  state.resources.hardware.amount = 200;
  state.resources.hardware.byTier.aluminum = 200;
  state.resources.hardware.cap = 500;
  state.resources.propellant.amount = 1000;
  state.resources.propellant.cap = 2000;
  state.resources.reputation.amount = 100;
  return state.resources;
}

describe('startNextContractStage', () => {
  it('starts payloadIntegration fresh: pays 40 H, starts the correctly-sized process, tags the pad, tags the contract with padId', () => {
    const resources = fundedResources();
    const contracts = contractsWith([tier1Offer()], [activeContract('contract-1-0')]);
    const result = startNextContractStage(resources, mission(), contracts, 'padA', 'contract-1-0', [], createInitialState().buildings, [], [], 0);
    expect(result).not.toBeNull();
    expect(result!.resources.hardware.amount).toBe(160); // 200 - 40
    expect(result!.processes).toHaveLength(1);
    expect(result!.processes[0]).toMatchObject({
      kind: 'integration',
      durationMs: SATELLITE_BUILD[1].integrationDurationMs,
      payload: { missionKind: 'contractPayload', padId: 'padA', stageId: 'payloadIntegration' },
    });
    expect(result!.mission.pads.padA?.contractId).toBe('contract-1-0');
    expect(result!.mission.pads.padA?.rocketStatus).toBe('integrating');
    expect(result!.contracts.active[0].padId).toBe('padA');
  });

  it('refuses a fresh start on a pad occupied by a story mission', () => {
    const resources = fundedResources();
    const contracts = contractsWith([tier1Offer()], [activeContract('contract-1-0')]);
    const m = mission({ pads: { padA: { ...emptyPadMissionState(), rocketStatus: 'integrating' } } });
    expect(startNextContractStage(resources, m, contracts, 'padA', 'contract-1-0', [], createInitialState().buildings, [], [], 0)).toBeNull();
  });

  it('refuses when the contract is not a currently-accepted offer (not accepted / already fulfilled / already on another pad)', () => {
    const resources = fundedResources();
    const buildings = createInitialState().buildings;
    expect(startNextContractStage(resources, mission(), contractsWith([tier1Offer()], []), 'padA', 'contract-1-0', [], buildings, [], [], 0)).toBeNull();
    expect(
      startNextContractStage(resources, mission(), contractsWith([tier1Offer()], [activeContract('contract-1-0', { fulfilled: true })]), 'padA', 'contract-1-0', [], buildings, [], [], 0),
    ).toBeNull();
    expect(
      startNextContractStage(resources, mission(), contractsWith([tier1Offer()], [activeContract('contract-1-0', { padId: 'padB' })]), 'padA', 'contract-1-0', [], buildings, [], [], 0),
    ).toBeNull();
  });

  it('refuses tier 1 below its Reputation gate (20)', () => {
    const resources = { ...fundedResources(), reputation: { ...fundedResources().reputation, amount: 10 } };
    const contracts = contractsWith([tier1Offer()], [activeContract('contract-1-0')]);
    expect(startNextContractStage(resources, mission(), contracts, 'padA', 'contract-1-0', [], createInitialState().buildings, [], [], 0)).toBeNull();
  });

  it('refuses tier 2 without the VAB Clean Room upgrade, even with enough Titanium Hardware and Reputation', () => {
    const resources = fundedResources();
    resources.hardware.byTier.titanium = 200;
    resources.hardware.amount = 200 + 200;
    const contracts = contractsWith([tier2Offer()], [activeContract('contract-2-0')]);
    expect(startNextContractStage(resources, mission(), contracts, 'padA', 'contract-2-0', [], createInitialState().buildings, [], [], 0)).toBeNull();
  });

  it('refuses tier 2 when Hardware exists but not at Titanium tier, even with Clean Room owned', () => {
    const resources = fundedResources(); // 200 aluminum, 0 titanium
    const buildings = createInitialState().buildings;
    buildings.vab.upgrades = ['cleanRoom'];
    const contracts = contractsWith([tier2Offer()], [activeContract('contract-2-0')]);
    expect(startNextContractStage(resources, mission(), contracts, 'padA', 'contract-2-0', [], buildings, [], [], 0)).toBeNull();
  });

  it('accepts tier 2 with Clean Room + enough Titanium Hardware + Reputation >= 50', () => {
    const resources = fundedResources();
    resources.hardware.byTier.titanium = 200;
    resources.hardware.amount = 200 + 200;
    const buildings = createInitialState().buildings;
    buildings.vab.upgrades = ['cleanRoom'];
    const contracts = contractsWith([tier2Offer()], [activeContract('contract-2-0')]);
    const result = startNextContractStage(resources, mission(), contracts, 'padA', 'contract-2-0', [], buildings, [], [], 0);
    expect(result).not.toBeNull();
    expect(result!.resources.hardware.byTier.titanium).toBe(120); // 200 - 80
    expect(result!.processes[0].durationMs).toBe(SATELLITE_BUILD[2].integrationDurationMs);
  });

  it('refuses when a stage is already running on this pad', () => {
    const resources = fundedResources();
    const contracts = contractsWith([tier1Offer()], [activeContract('contract-1-0', { padId: 'padA' })]);
    const m = mission({ pads: { padA: { ...emptyPadMissionState(), contractId: 'contract-1-0', rocketStatus: 'integrating' } } });
    const running: Process = { id: 'x', kind: 'integration', startedAt: 0, durationMs: 1000, payload: { missionKind: 'contractPayload', padId: 'padA', stageId: 'payloadIntegration' } };
    expect(startNextContractStage(resources, m, contracts, 'padA', 'contract-1-0', [running], createInitialState().buildings, [], [], 0)).toBeNull();
  });

  it('continues to padTransfer once payloadIntegration is done, without re-checking the Reputation gate', () => {
    const resources = { ...fundedResources(), reputation: { ...fundedResources().reputation, amount: 0 } };
    const contracts = contractsWith([tier1Offer()], [activeContract('contract-1-0', { padId: 'padA' })]);
    const m = mission({ pads: { padA: { ...emptyPadMissionState(), contractId: 'contract-1-0', rocketStatus: 'in_vab', stagesDone: ['payloadIntegration'] } } });
    const result = startNextContractStage(resources, m, contracts, 'padA', 'contract-1-0', [], createInitialState().buildings, [], [], 0);
    expect(result).not.toBeNull();
    expect(result!.processes[0]).toMatchObject({ durationMs: 5 * MIN, payload: { stageId: 'padTransfer' } });
  });

  it('resolves the free, instant flightReview stage: no process, no cost, marks stagesDone', () => {
    const resources = fundedResources();
    const contracts = contractsWith([tier1Offer()], [activeContract('contract-1-0', { padId: 'padA' })]);
    const m = mission({
      pads: { padA: { ...emptyPadMissionState(), contractId: 'contract-1-0', rocketStatus: 'on_pad', stagesDone: ['payloadIntegration', 'padTransfer', 'propellantLoad'] } },
    });
    const before = resources.research.amount;
    const result = startNextContractStage(resources, m, contracts, 'padA', 'contract-1-0', [], createInitialState().buildings, [], [], 0);
    expect(result).not.toBeNull();
    expect(result!.processes).toEqual([]); // unchanged input array — free (Option 1), nothing to pay
    expect(result!.resources.research.amount).toBe(before);
    expect(result!.mission.pads.padA?.stagesDone).toContain('flightReview');
  });
});

describe('applyCompletedContractStages', () => {
  it('flips stagesDone and sets rocketStatus to in_vab after payloadIntegration', () => {
    const m = mission({ pads: { padA: { ...emptyPadMissionState(), contractId: 'contract-1-0', rocketStatus: 'integrating' } } });
    const completed: Process[] = [{ id: 'p1', kind: 'integration', startedAt: 0, durationMs: 0, payload: { missionKind: 'contractPayload', padId: 'padA', stageId: 'payloadIntegration' } }];
    const result = applyCompletedContractStages(m, completed);
    expect(result.pads.padA?.stagesDone).toContain('payloadIntegration');
    expect(result.pads.padA?.rocketStatus).toBe('in_vab');
  });

  it('ignores processes for other mission kinds', () => {
    const m = mission();
    const completed: Process[] = [{ id: 'p1', kind: 'integration', startedAt: 0, durationMs: 0, payload: { missionKind: 'auroraI', padId: 'padA', stageId: 'structure' } }];
    expect(applyCompletedContractStages(m, completed)).toBe(m);
  });
});

describe('resolveContractChecklist', () => {
  function completePad(overrides: Partial<PadMissionState> = {}) {
    return {
      ...emptyPadMissionState(),
      contractId: 'contract-1-0',
      rocketStatus: 'on_pad' as const,
      stagesDone: ['payloadIntegration', 'padTransfer', 'propellantLoad', 'flightReview'],
      ...overrides,
    };
  }

  it('is a no-op for a pad with no contract linked', () => {
    const m = mission();
    const buildings = createInitialState().buildings;
    const result = resolveContractChecklist(m, 'padA', buildings, createInitialState().staff, engineState(), 0);
    expect(result).toBe(m);
  });

  it('does not commit while an item is pending (e.g. weather)', () => {
    const buildings = createInitialState().buildings;
    buildings.trackingStation.level = 1;
    const m = mission({ pads: { padA: completePad() } });
    const result = resolveContractChecklist(m, 'padA', buildings, createInitialState().staff, engineState({ certified: true }), 0);
    expect(result.pads.padA?.committedRoll).toBeNull();
  });

  it('commits a roll once all 8 items are true, applying the E-03 confidence penalty and clearing it', () => {
    const buildings = createInitialState().buildings;
    buildings.trackingStation.level = 1;
    buildings.launchControl.level = 1;
    const staff = createInitialState().staff;
    staff.pools.controller.hired = 3;
    staff.pools.controller.assigned.launchControl = 3;
    const m = mission({
      pads: { padA: completePad({ checklist: { ...emptyPadMissionState().checklist, weatherWindow: true } }) },
      confidencePenaltyNext: 10,
    });
    const result = resolveContractChecklist(m, 'padA', buildings, staff, engineState({ certified: true, extendedCertified: true }), 0, () => 0.2);
    expect(result.pads.padA?.committedRoll).toBe(0.2);
    expect(result.pads.padA?.confidence).toBe(90); // 100 (extended cert, all 8 done) - 10 penalty
    expect(result.confidencePenaltyNext).toBeUndefined();
  });
});

describe('launchContractMission', () => {
  function committedMission(committedRoll: number, confidence = 90, contractId = 'contract-1-0') {
    return mission({
      pads: {
        padA: {
          ...emptyPadMissionState(),
          contractId,
          rocketStatus: 'on_pad',
          stagesDone: ['payloadIntegration', 'padTransfer', 'propellantLoad', 'flightReview'],
          confidence,
          committedRoll,
        },
      },
    });
  }

  it('refuses without a mission on this pad or before a roll is committed', () => {
    const resources = fundedResources();
    const contracts = contractsWith([tier1Offer()], [activeContract('contract-1-0', { padId: 'padA' })]);
    expect(launchContractMission(resources, mission(), contracts, 'padA', [], [], 0)).toBeNull();
  });

  it('success: pays ONLY the contract tier reward, marks fulfilled, clears padId, resets the pad, logs a "contract" launch', () => {
    const resources = fundedResources();
    const contracts = contractsWith([tier1Offer()], [activeContract('contract-1-0', { padId: 'padA' })]);
    const m = committedMission(0.5, 90); // 0.5 < 0.9 -> success
    const result = launchContractMission(resources, m, contracts, 'padA', [], [], 5000);
    expect(result).not.toBeNull();
    const reward = CONTRACT_TIERS[1].reward;
    expect(result!.resources.funding.amount).toBe(reward.funding);
    expect(result!.resources.reputation.amount).toBe(resources.reputation.amount + reward.reputation);
    expect(result!.resources.flightxp.amount).toBe(reward.flightxp);
    expect(result!.resources.research.amount).toBe(reward.flightData);
    expect(result!.contracts.active[0]).toMatchObject({ fulfilled: true, padId: null });
    expect(result!.mission.pads.padA?.contractId).toBeNull();
    expect(result!.mission.pads.padA?.rocketStatus).toBe('none');
    expect(result!.mission.launches).toEqual([{ id: 'contract-launch-padA-5000', padId: 'padA', missionType: 'contract', success: true, timestamp: 5000, contractId: 'contract-1-0' }]);
  });

  it('failure: 80%/60% of the CONTRACT reward XP/Flight-Data, 60% Hardware recovery of what integration spent, no Funding/Rep, contract stays active for retry, half-duration re-integration set', () => {
    const resources = fundedResources();
    resources.hardware.amount = 0;
    resources.hardware.byTier.aluminum = 0;
    const contracts = contractsWith([tier1Offer()], [activeContract('contract-1-0', { padId: 'padA' })]);
    const m = committedMission(0.95, 90); // 0.95 >= 0.9 -> failure
    const result = launchContractMission(resources, m, contracts, 'padA', [], [], 5000);
    const reward = CONTRACT_TIERS[1].reward;
    expect(result!.resources.funding.amount).toBe(0);
    expect(result!.resources.reputation.amount).toBe(resources.reputation.amount); // unchanged
    expect(result!.resources.flightxp.amount).toBe(Math.round(reward.flightxp * 0.8) || reward.flightxp * 0.8);
    expect(result!.resources.research.amount).toBe(reward.flightData * 0.6);
    expect(result!.resources.hardware.amount).toBe(SATELLITE_BUILD[1].hardware * 0.6);
    expect(result!.contracts.active[0]).toMatchObject({ fulfilled: false, padId: null }); // stays active, freed to retry
    expect(result!.mission.auroraHalfDurationNext?.padA).toBe(true);
  });
});
