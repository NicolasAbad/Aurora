import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { canAffordCost } from '../core/actions';
import { buildingForPad, hasAuroraISuccess, nextAuroraStageId } from '../core/auroraMission';
import { computeConfidenceBreakdown } from '../core/confidence';
import { AURORA_I_STAGES_BY_ID } from '../data/auroraI';
import { CONTRACT_TIERS, SATELLITE_BUILD } from '../data/contracts';
import { narrativeText } from '../data/narrative';
import { formatDuration, formatPercent } from '../core/format';
import { progressFraction, remainingMs } from '../core/time';
import { ConfidenceDial } from './ConfidenceDial';
import { CostLabel } from './CostLabel';
import { RocketBlueprint } from './RocketBlueprint';
import { useNow } from './useNow';
import { WeatherRadarSweep } from './WeatherRadarSweep';
import type { ChecklistItemId, LaunchRecord, PadId, Process } from '../core/types';

const CHECKLIST_LABELS: Record<ChecklistItemId, string> = {
  rocketIntegrated: 'Rocket integrated',
  enginesCertified: 'Engines certified',
  transferToPad: 'Transfer to pad',
  propellantLoaded: 'Propellant loaded',
  flightReview: 'Flight review',
  controllersOnStation: 'Controllers on station',
  trackingActive: 'Tracking active',
  weatherWindow: 'Weather window',
};

const CHECKLIST_HINTS: Partial<Record<ChecklistItemId, string>> = {
  enginesCertified: 'Certify Orbital-1 at the Engine Test Stand.',
  controllersOnStation: 'Fully staff Launch Control with Controllers.',
  trackingActive: 'Build the Tracking Station.',
};

const CHECKLIST_ORDER: ChecklistItemId[] = [
  'rocketIntegrated',
  'enginesCertified',
  'transferToPad',
  'propellantLoaded',
  'flightReview',
  'controllersOnStation',
  'trackingActive',
  'weatherWindow',
];

function findPadProcess(
  processes: Process[],
  padId: PadId,
  kind: 'integration' | 'weather_window',
  missionKind: 'auroraI' | 'contractPayload',
): Process | undefined {
  return processes.find((p) => p.kind === kind && p.payload.missionKind === missionKind && p.payload.padId === padId);
}

function Ring({ process }: { process: Process }) {
  const now = useNow();
  return (
    <div className="research-node__ring" style={{ '--fraction': progressFraction(process, now) } as React.CSSProperties}>
      <span>{formatDuration(remainingMs(process, now))}</span>
    </div>
  );
}

function ChecklistRow({ item, done, process, hint }: { item: ChecklistItemId; done: boolean; process?: Process; hint?: string }) {
  // UI_SPEC screen 4 (Sprint 10.5, cheap win): the weather-window item gets the radar
  // sweep instead of the generic progress ring every other checklist item still uses.
  const isWeather = item === 'weatherWindow';
  return (
    <div className={`checklist-row ${done ? 'checklist-row--done' : ''}`}>
      <span className="checklist-row__mark">{done ? '✓' : '○'}</span>
      <span className="checklist-row__label">{CHECKLIST_LABELS[item]}</span>
      {!done && process && (isWeather ? <WeatherRadarSweep process={process} /> : <Ring process={process} />)}
      {!done && !process && hint && <span className="checklist-row__note">{hint}</span>}
    </div>
  );
}

function NextStageWidget({ padId }: { padId: PadId }) {
  const pad = useGameStore(useShallow((s) => s.mission.pads[padId]))!;
  const processes = useGameStore(useShallow((s) => s.processes));
  const resources = useGameStore(useShallow((s) => s.resources));
  const startAuroraStage = useGameStore((s) => s.startAuroraStage);
  const orbital1Certified = useGameStore((s) => s.certifications.engines.orbital1.certified);
  const completedTech = useGameStore(useShallow((s) => s.research.completed));
  const launches = useGameStore(useShallow((s) => s.mission.launches));

  const stageId = nextAuroraStageId(pad.stagesDone);
  const process = findPadProcess(processes, padId, 'integration', 'auroraI');
  if (process) {
    const stage = AURORA_I_STAGES_BY_ID.get(process.payload.stageId as never);
    return (
      <div className="research-node">
        <div className="research-node__name">In progress: {stage?.name}</div>
        <Ring process={process} />
      </div>
    );
  }
  if (!stageId) return null; // all 8 stages done

  const stage = AURORA_I_STAGES_BY_ID.get(stageId)!;
  const blockedOnEngines = stageId === 'engines' && !orbital1Certified;
  // ECONOMY §7 (v3.9): orbitalFlight gates Aurora II onward, never Aurora I's own launch —
  // only ever relevant at 'structure' (a fresh integration start) once a prior success exists.
  const blockedOnOrbitalFlight =
    stageId === 'structure' && hasAuroraISuccess(launches) && !completedTech.includes('orbitalFlight');
  const canAfford = canAffordCost(resources, stage.cost);

  return (
    <div className="research-node">
      <div className="research-node__name">Next: {stage.name}</div>
      <div className="research-node__cost">
        <CostLabel cost={stage.cost} />
        {stage.durationMs > 0 ? `, ${formatDuration(stage.durationMs)}` : ' (instant)'}
      </div>
      {blockedOnEngines && <div className="research-node__condition">Requires: Orbital-1 certified</div>}
      {blockedOnOrbitalFlight && <div className="research-node__condition">Requires: Orbital flight tech</div>}
      <button
        type="button"
        className="upgrade-button"
        disabled={blockedOnEngines || blockedOnOrbitalFlight || !canAfford}
        onClick={() => startAuroraStage(padId)}
      >
        {stage.durationMs > 0 ? 'Start' : 'Pay'}
      </button>
    </div>
  );
}

// ECONOMY §10 v3.6: a contract-linked pad's 4-stage build (payloadIntegration/padTransfer/
// propellantLoad/flightReview) — mirrors NextStageWidget's shape exactly, against
// core/contractMission.ts's stage order instead of Aurora's 5-stage VAB table.
const CONTRACT_STAGE_LABELS: Record<string, string> = {
  payloadIntegration: 'Payload integration',
  padTransfer: 'Pad transfer',
  propellantLoad: 'Propellant load',
  flightReview: 'Flight review',
};

function ContractNextStageWidget({ padId, offerId, tier }: { padId: PadId; offerId: string; tier: 1 | 2 }) {
  const pad = useGameStore(useShallow((s) => s.mission.pads[padId]))!;
  const processes = useGameStore(useShallow((s) => s.processes));
  const resources = useGameStore(useShallow((s) => s.resources));
  const startContractStage = useGameStore((s) => s.startContractStage);

  const process = findPadProcess(processes, padId, 'integration', 'contractPayload');
  if (process) {
    const stageId = process.payload.stageId as string;
    return (
      <div className="research-node">
        <div className="research-node__name">In progress: {CONTRACT_STAGE_LABELS[stageId] ?? stageId}</div>
        <Ring process={process} />
      </div>
    );
  }

  const build = SATELLITE_BUILD[tier];
  const order = ['payloadIntegration', 'padTransfer', 'propellantLoad', 'flightReview'];
  const stageId = order.find((id) => !pad.stagesDone.includes(id));
  if (!stageId) return null; // all 4 stages done

  const cost =
    stageId === 'payloadIntegration'
      ? { hardware: build.hardware }
      : stageId === 'propellantLoad'
        ? { propellant: build.propellant }
        : {};
  const canAfford = canAffordCost(resources, cost, stageId === 'payloadIntegration' ? build.minHardwareTier : undefined);

  return (
    <div className="research-node">
      <div className="research-node__name">Next: {CONTRACT_STAGE_LABELS[stageId]}</div>
      <div className="research-node__cost">
        <CostLabel cost={cost} />
        {stageId === 'flightReview' ? ' (instant, free)' : ''}
      </div>
      <button
        type="button"
        className="upgrade-button"
        disabled={!canAfford}
        onClick={() => startContractStage(padId, offerId)}
      >
        {stageId === 'flightReview' ? 'Pay' : 'Start'}
      </button>
    </div>
  );
}

function ConfidenceBreakdownView({ padId }: { padId: PadId }) {
  const [expanded, setExpanded] = useState(false);
  const pad = useGameStore(useShallow((s) => s.mission.pads[padId]))!;
  const engineState = useGameStore(useShallow((s) => s.certifications.engines.orbital1));
  // Launch Pad B (Sprint 9) has its own, separate `upgrades` array — reading
  // `buildings.launchPad` unconditionally was a real bug once Pad B could exist.
  const serviceTowerBuilt = useGameStore((s) => s.buildings[buildingForPad(padId)].upgrades.includes('serviceTower'));
  const flightXp = useGameStore((s) => s.resources.flightxp.amount);

  const breakdown = computeConfidenceBreakdown({
    engineState,
    flightReviewApproved: pad.checklist.flightReview,
    controllersFullyStaffed: pad.checklist.controllersOnStation,
    serviceTowerBuilt,
    weatherResolved: pad.checklist.weatherWindow,
    flightXp,
  });

  return (
    <div className="confidence-breakdown">
      <button
        type="button"
        className="confidence-dial-button"
        aria-expanded={expanded}
        aria-label={`Confidence: ${formatPercent(breakdown.total)}. Tap for breakdown.`}
        onClick={() => setExpanded((e) => !e)}
      >
        <ConfidenceDial breakdown={breakdown} />
      </button>
      {expanded && (
        <div className="confidence-breakdown__terms">
          <div>Base: +{breakdown.base}</div>
          <div>Engine certification: +{breakdown.certification}</div>
          <div>Flight review: +{breakdown.flightReview}</div>
          <div>Controllers staffed: +{breakdown.controllers}</div>
          <div>Service Tower: +{breakdown.serviceTower}</div>
          <div>Optimal weather: +{breakdown.weather}</div>
          <div>Flight Experience: +{breakdown.experience}</div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ launch, tierReward, onDismiss }: { launch: LaunchRecord; tierReward?: string; onDismiss: () => void }) {
  const isContract = launch.missionType === 'contract';
  // ECONOMY §7 (v3.9): Aurora II reuses the same reward values, but must not claim to be
  // "Aurora I" / "First orbit" (that Program Record is Aurora I's alone) — real gap found
  // in Playwright verification, harmless while Aurora I could only ever happen once.
  const headline = isContract
    ? launch.success
      ? 'Contract delivered.'
      : "It didn't make it."
    : launch.success
      ? launch.missionType === 'auroraII'
        ? narrativeText('T-27')
        : 'Aurora I is flying.'
      : "It didn't make it.";
  const detail = isContract
    ? launch.success
      ? `Contract fulfilled. Rewards: ${tierReward}.`
      : 'Recovered 60% of integration Hardware as debris. The contract stays active — rebuild and retry before its deadline. The next integration on this pad runs at half duration.'
    : launch.success
      ? launch.missionType === 'auroraII'
        ? narrativeText('T-28')
        : 'First orbit. Rewards: +250 Flight XP, +60 Reputation, +2,000 Flight Data.'
      : 'Recovered 60% of integration Hardware as debris. +200 Flight XP, +1,200 Flight Data. The next integration on this pad runs at half duration.';

  return (
    <div className={`launch-result ${launch.success ? 'launch-result--success' : 'launch-result--failure'}`}>
      <div className="launch-result__headline">{headline}</div>
      <div className="launch-result__detail">{detail}</div>
      <button type="button" className="upgrade-button" onClick={onDismiss}>
        Continue
      </button>
    </div>
  );
}

/** GDD §7 / UI_SPEC §3.4: the full 8-item Launch Sequence, shown once the VAB exists.
 * Sprint 9: also hosts satellite-contract missions on the same pad (ECONOMY §10 v3.6 —
 * "use the full launch checklist with Confidence") — the checklist/Confidence/countdown
 * chrome is identical either way; only the "what's next to build" widget and the result
 * copy differ, branched on `pad.contractId`. Presentation note: the doc's "own full
 * screen... 10->0 countdown" animation is deliberately not built here (Sprint 11 polish
 * territory, same restraint Sprint 6 used for sondas) — pressing the dominant button
 * resolves the already-committed roll (rule 12) immediately and shows its result inline. */
export function LaunchSequencePanel({ padId }: { padId: PadId }) {
  const pad = useGameStore(useShallow((s) => s.mission.pads[padId]));
  const processes = useGameStore(useShallow((s) => s.processes));
  const launches = useGameStore(useShallow((s) => s.mission.launches));
  const offers = useGameStore(useShallow((s) => s.contracts.offers));
  const startAuroraWeather = useGameStore((s) => s.startAuroraWeather);
  const launchAurora = useGameStore((s) => s.launchAurora);
  const startContractWeather = useGameStore((s) => s.startContractWeather);
  const launchContract = useGameStore((s) => s.launchContract);
  const [dismissedLaunchId, setDismissedLaunchId] = useState<string | null>(null);

  if (!pad) return null;

  const isContract = pad.contractId != null;
  const offer = isContract ? offers.find((o) => o.id === pad.contractId) : undefined;
  const tier = offer && (offer.tier === 1 || offer.tier === 2) ? offer.tier : null;

  const weatherProcess = findPadProcess(processes, padId, 'weather_window', isContract ? 'contractPayload' : 'auroraI');
  const latestLaunch = [...launches].reverse().find((l) => l.padId === padId);
  const showResult = pad.rocketStatus === 'none' && latestLaunch && latestLaunch.id !== dismissedLaunchId;
  // ResultCard renders AFTER launchContract has already reset pad.contractId to null, so
  // the reward text must come from the launch record's own contractId (still present),
  // never from the live pad state — reading `offer`/`tier` here would always be
  // undefined by the time a result is actually showing (a real bug this exact ordering
  // caught during Playwright verification: the card read "Rewards: undefined").
  const resultOffer =
    latestLaunch?.missionType === 'contract' && latestLaunch.contractId
      ? offers.find((o) => o.id === latestLaunch.contractId)
      : undefined;
  const resultTier = resultOffer && (resultOffer.tier === 1 || resultOffer.tier === 2) ? resultOffer.tier : null;
  const tierReward = resultTier
    ? (() => {
        const r = CONTRACT_TIERS[resultTier].reward;
        return `$${r.funding.toLocaleString()}, +${r.reputation} Reputation, +${r.flightxp} Flight XP, +${r.flightData} Flight Data`;
      })()
    : undefined;

  return (
    <div className="research-panel launch-sequence">
      <div className="research-panel__header">
        Launch Sequence — Pad {padId === 'padA' ? 'A' : 'B'}
        {isContract && offer ? ` — ${offer.client}` : ''}
      </div>
      {showResult && latestLaunch ? (
        <ResultCard launch={latestLaunch} tierReward={tierReward} onDismiss={() => setDismissedLaunchId(latestLaunch.id)} />
      ) : (
        <>
          {/* UI_SPEC screen 4 (Sprint 9.5, NEW): progressive rocket blueprint — Aurora's
              own 5-stage VAB breakdown only (contract satellites use a single lump
              "Payload integration" stage per ECONOMY §10, so there's nothing to
              progressively reveal there). */}
          {!isContract && <RocketBlueprint stagesDone={pad.stagesDone} />}
          <ConfidenceBreakdownView padId={padId} />
          <div className="launch-sequence__checklist">
            {CHECKLIST_ORDER.map((item) => {
              if (item === 'weatherWindow') {
                return <ChecklistRow key={item} item={item} done={pad.checklist.weatherWindow} process={weatherProcess} />;
              }
              return <ChecklistRow key={item} item={item} done={pad.checklist[item]} hint={CHECKLIST_HINTS[item]} />;
            })}
          </div>
          {!pad.checklist.weatherWindow && !weatherProcess && (
            <button
              type="button"
              className="upgrade-button"
              onClick={() => (isContract ? startContractWeather(padId) : startAuroraWeather(padId))}
            >
              Check weather
            </button>
          )}
          {isContract && tier && pad.contractId ? (
            <ContractNextStageWidget padId={padId} offerId={pad.contractId} tier={tier} />
          ) : (
            !isContract && <NextStageWidget padId={padId} />
          )}
          <button
            type="button"
            className="countdown-button"
            disabled={pad.committedRoll === null}
            onClick={() => {
              if (pad.confidence < 100 && !window.confirm(`Launch at ${formatPercent(pad.confidence)}? Success is not guaranteed.`)) {
                return;
              }
              if (isContract) {
                launchContract(padId);
              } else {
                launchAurora(padId);
              }
            }}
          >
            {pad.committedRoll === null ? 'Complete the checklist' : `Launch at ${formatPercent(pad.confidence)}`}
          </button>
        </>
      )}
    </div>
  );
}
