import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { canAffordCost } from '../core/actions';
import { nextAuroraStageId } from '../core/auroraMission';
import { computeConfidenceBreakdown } from '../core/confidence';
import { AURORA_I_STAGES_BY_ID } from '../data/auroraI';
import { formatDuration, formatPercent } from '../core/format';
import { progressFraction, remainingMs } from '../core/time';
import { CostLabel } from './CostLabel';
import { useNow } from './useNow';
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

function findPadProcess(processes: Process[], padId: PadId, kind: 'integration' | 'weather_window'): Process | undefined {
  return processes.find((p) => p.kind === kind && p.payload.missionKind === 'auroraI' && p.payload.padId === padId);
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
  return (
    <div className={`checklist-row ${done ? 'checklist-row--done' : ''}`}>
      <span className="checklist-row__mark">{done ? '✓' : '○'}</span>
      <span className="checklist-row__label">{CHECKLIST_LABELS[item]}</span>
      {!done && process && <Ring process={process} />}
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

  const stageId = nextAuroraStageId(pad.stagesDone);
  const process = findPadProcess(processes, padId, 'integration');
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
  const canAfford = canAffordCost(resources, stage.cost);

  return (
    <div className="research-node">
      <div className="research-node__name">Next: {stage.name}</div>
      <div className="research-node__cost">
        <CostLabel cost={stage.cost} />
        {stage.durationMs > 0 ? `, ${formatDuration(stage.durationMs)}` : ' (instant)'}
      </div>
      {blockedOnEngines && <div className="research-node__condition">Requires: Orbital-1 certified</div>}
      <button
        type="button"
        className="upgrade-button"
        disabled={blockedOnEngines || !canAfford}
        onClick={() => startAuroraStage(padId)}
      >
        {stage.durationMs > 0 ? 'Start' : 'Pay'}
      </button>
    </div>
  );
}

function ConfidenceBreakdownView({ padId }: { padId: PadId }) {
  const [expanded, setExpanded] = useState(false);
  const pad = useGameStore(useShallow((s) => s.mission.pads[padId]))!;
  const engineState = useGameStore(useShallow((s) => s.certifications.engines.orbital1));
  const serviceTowerBuilt = useGameStore((s) => s.buildings.launchPad.upgrades.includes('serviceTower'));
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
      <button type="button" className="confidence-breakdown__toggle" onClick={() => setExpanded((e) => !e)}>
        Confidence: {formatPercent(breakdown.total)}
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

function ResultCard({ launch, onDismiss }: { launch: LaunchRecord; onDismiss: () => void }) {
  return (
    <div className={`launch-result ${launch.success ? 'launch-result--success' : 'launch-result--failure'}`}>
      <div className="launch-result__headline">{launch.success ? 'Aurora I is flying.' : "It didn't make it."}</div>
      <div className="launch-result__detail">
        {launch.success
          ? 'First orbit. Rewards: +250 Flight XP, +60 Reputation, +2,000 Flight Data.'
          : 'Recovered 60% of integration Hardware as debris. +200 Flight XP, +1,200 Flight Data. The next integration on this pad runs at half duration.'}
      </div>
      <button type="button" className="upgrade-button" onClick={onDismiss}>
        Continue
      </button>
    </div>
  );
}

/** GDD §7 / UI_SPEC §3.4: the full 8-item Launch Sequence, shown once the VAB exists.
 * Presentation note: the doc's "own full screen... 10->0 countdown" animation is
 * deliberately not built here (Sprint 11 polish territory, same restraint Sprint 6 used
 * for sondas) — pressing the dominant button resolves the already-committed roll (rule
 * 12) immediately and shows its result inline. */
export function LaunchSequencePanel({ padId }: { padId: PadId }) {
  const pad = useGameStore(useShallow((s) => s.mission.pads[padId]));
  const processes = useGameStore(useShallow((s) => s.processes));
  const launches = useGameStore(useShallow((s) => s.mission.launches));
  const startAuroraWeather = useGameStore((s) => s.startAuroraWeather);
  const launchAurora = useGameStore((s) => s.launchAurora);
  const [dismissedLaunchId, setDismissedLaunchId] = useState<string | null>(null);

  if (!pad) return null;

  const weatherProcess = findPadProcess(processes, padId, 'weather_window');
  const latestLaunch = [...launches].reverse().find((l) => l.padId === padId);
  const showResult = pad.rocketStatus === 'none' && latestLaunch && latestLaunch.id !== dismissedLaunchId;

  return (
    <div className="research-panel launch-sequence">
      <div className="research-panel__header">Launch Sequence — Pad {padId === 'padA' ? 'A' : 'B'}</div>
      {showResult && latestLaunch ? (
        <ResultCard launch={latestLaunch} onDismiss={() => setDismissedLaunchId(latestLaunch.id)} />
      ) : (
        <>
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
            <button type="button" className="upgrade-button" onClick={() => startAuroraWeather(padId)}>
              Check weather
            </button>
          )}
          <NextStageWidget padId={padId} />
          <button
            type="button"
            className="countdown-button"
            disabled={pad.committedRoll === null}
            onClick={() => {
              if (pad.confidence < 100 && !window.confirm(`Launch at ${formatPercent(pad.confidence)}? Success is not guaranteed.`)) {
                return;
              }
              launchAurora(padId);
            }}
          >
            {pad.committedRoll === null ? 'Complete the checklist' : `Launch at ${formatPercent(pad.confidence)}`}
          </button>
        </>
      )}
    </div>
  );
}
