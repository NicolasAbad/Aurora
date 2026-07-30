import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { activePendingContracts } from '../core/contracts';
import { isSoundingRocketUnlocked } from '../core/soundingMission';
import { progressFraction, remainingMs } from '../core/time';
import { SOUNDING_ROCKETS, type SoundingRocketDef } from '../data/soundingRockets';
import { CONTRACT_TIERS, TIER0_PAYLOAD_EXTRA_HARDWARE, TIER0_PAYLOAD_EXTRA_PROPELLANT } from '../data/contracts';
import { FAILURE_FLIGHT_DATA_RATE, FAILURE_HARDWARE_RECOVERY_RATE, FAILURE_XP_RATE } from '../data/launch';
import { narrativeText } from '../data/narrative';
import { formatDuration, formatPercent } from '../core/format';
import { CostLabel } from './CostLabel';
import { useNow } from './useNow';
import { WeatherRadarSweep } from './WeatherRadarSweep';
import type { LaunchRecord, Process, SoundingChecklistItemId } from '../core/types';

function findProcess(processes: Process[], kind: 'integration' | 'weather_window'): Process | undefined {
  return processes.find((p) => p.kind === kind && p.payload.missionKind === 'sounding');
}

function ChecklistRing({ process }: { process: Process }) {
  const now = useNow();
  return (
    <div className="research-node__ring" style={{ '--fraction': progressFraction(process, now) } as React.CSSProperties}>
      <span>{formatDuration(remainingMs(process, now))}</span>
    </div>
  );
}

interface ChecklistRowProps {
  label: string;
  done: boolean;
  process?: Process;
  children?: React.ReactNode;
  // UI_SPEC screen 4 (Sprint 10.5, cheap win): the weather-window item gets the radar
  // sweep instead of the generic progress ring every other checklist item still uses —
  // same swap LaunchSequencePanel's own ChecklistRow makes.
  radar?: boolean;
}

function ChecklistRow({ label, done, process, children, radar }: ChecklistRowProps) {
  return (
    <div className={`checklist-row ${done ? 'checklist-row--done' : ''}`}>
      <span className="checklist-row__mark">{done ? '✓' : '○'}</span>
      <span className="checklist-row__label">{label}</span>
      {!done && process && (radar ? <WeatherRadarSweep process={process} /> : <ChecklistRing process={process} />)}
      {!done && !process && children}
    </div>
  );
}

/** Rocket-picker card shown when no mission is in flight — UI_SPEC §4's mandatory
 * disclosure rule (a real player CHOICE, unlike Probe-1's scripted test) applies in
 * full: cost, duration and what starting this actually does, all before the button. */
function RocketOption({ rocket, contractId }: { rocket: SoundingRocketDef; contractId: string | null }) {
  const completedTech = useGameStore(useShallow((s) => s.research.completed));
  const extendedRailBought = useGameStore((s) => s.buildings.launchRail.upgrades.includes('extendedRail'));
  const hardware = useGameStore((s) => s.resources.hardware.amount);
  const startSoundingMission = useGameStore((s) => s.startSoundingMission);

  const unlocked = isSoundingRocketUnlocked(rocket.id, completedTech, extendedRailBought);
  if (!unlocked) {
    return (
      <div className="research-node research-node--locked">
        <div className="research-node__name">{rocket.name}</div>
        <div className="research-node__condition">
          Requires: Probe-1 engine{rocket.requiresExtendedRail ? ' + Extended Rail' : ''}
        </div>
      </div>
    );
  }

  const extraHardware = contractId ? TIER0_PAYLOAD_EXTRA_HARDWARE : 0;
  const cost = { hardware: rocket.assemblyHardware + extraHardware };
  const canAfford = hardware >= cost.hardware;

  return (
    <div className="research-node">
      <div className="research-node__name">{contractId ? `${rocket.name} (fulfill contract)` : rocket.name}</div>
      <div className="research-node__cost">
        <CostLabel cost={cost} />, {formatDuration(rocket.assemblyDurationMs)}
      </div>
      <div className="research-node__description">
        Assembles and prepares a launch. {contractId ? 'Delivers the accepted tier-0 contract on success.' : ''}
      </div>
      <button
        type="button"
        className="upgrade-button"
        disabled={!canAfford}
        onClick={() => startSoundingMission(rocket.id, contractId)}
      >
        Assemble
      </button>
    </div>
  );
}

/** UI_SPEC §3 screen 5 (Sprint 9.5): S-1/S-2 now get the same dedicated result treatment
 * Aurora I already has (LaunchSequencePanel's own ResultCard) instead of ending in an
 * easy-to-miss Mission Log line. `launch.contractId` set means this S-1 also fulfilled
 * the accepted tier-0 contract — its reward is ADDITIONAL to the flight's own reward,
 * same "Contract fulfilled is on top of the underlying flight" rule Aurora's contract
 * variant already follows (ECONOMY §8). */
function ResultCard({ launch, onDismiss }: { launch: LaunchRecord; onDismiss: () => void }) {
  const rocket = SOUNDING_ROCKETS[launch.missionType as 's1' | 's2'];
  const headline = launch.success ? `${rocket.name} flight successful.` : "It didn't make it.";
  const detail = launch.success
    ? `+${rocket.successReward.flightxp} Flight XP, +${rocket.successReward.reputation} Reputation, +${rocket.successReward.flightData} Flight Data.`
    : `Recovered ${Math.round(FAILURE_HARDWARE_RECOVERY_RATE * 100)}% Hardware as debris. +${Math.round(rocket.successReward.flightxp * FAILURE_XP_RATE)} Flight XP, +${Math.round(rocket.successReward.flightData * FAILURE_FLIGHT_DATA_RATE)} Flight Data. Next assembly of this rocket runs at half duration.`;
  const contractDetail =
    launch.success && launch.contractId
      ? ` Contract fulfilled: +$${CONTRACT_TIERS[0].reward.funding.toLocaleString()}, +${CONTRACT_TIERS[0].reward.reputation} Reputation, +${CONTRACT_TIERS[0].reward.flightxp} Flight XP, +${CONTRACT_TIERS[0].reward.flightData} Flight Data.`
      : '';

  return (
    <div className={`launch-result ${launch.success ? 'launch-result--success' : 'launch-result--failure'}`}>
      <div className="launch-result__headline">{headline}</div>
      <div className="launch-result__detail">
        {detail}
        {contractDetail}
      </div>
      <button type="button" className="upgrade-button" onClick={onDismiss}>
        Continue
      </button>
    </div>
  );
}

function MissionPicker() {
  const contracts = useGameStore(useShallow((s) => s.contracts));
  const fulfillableContract = activePendingContracts(contracts).find(
    (a) => contracts.offers.find((o) => o.id === a.offerId)?.tier === 0,
  );

  return (
    <div className="sounding-mission__picker">
      <RocketOption rocket={SOUNDING_ROCKETS.s1} contractId={null} />
      {fulfillableContract && <RocketOption rocket={SOUNDING_ROCKETS.s1} contractId={fulfillableContract.offerId} />}
      <RocketOption rocket={SOUNDING_ROCKETS.s2} contractId={null} />
    </div>
  );
}

const CHECKLIST_LABELS: Record<SoundingChecklistItemId, string> = {
  assembled: 'Assembled',
  propellantReady: 'Propellant',
  weatherWindow: 'Weather window',
  flightReview: 'Flight review',
};

function InFlightMission() {
  const mission = useGameStore(useShallow((s) => s.mission.sounding))!;
  const processes = useGameStore(useShallow((s) => s.processes));
  const propellant = useGameStore((s) => s.resources.propellant.amount);
  const research = useGameStore((s) => s.resources.research.amount);
  const startWeatherCheck = useGameStore((s) => s.startWeatherCheck);
  const payFlightReview = useGameStore((s) => s.payFlightReview);
  const launchSounding = useGameStore((s) => s.launchSounding);

  const rocket = SOUNDING_ROCKETS[mission.rocketId];
  const assemblyProcess = findProcess(processes, 'integration');
  const weatherProcess = findProcess(processes, 'weather_window');
  const requiredPropellant = rocket.launchPropellant + (mission.contractId ? TIER0_PAYLOAD_EXTRA_PROPELLANT : 0);

  const items: SoundingChecklistItemId[] =
    mission.rocketId === 's2'
      ? ['assembled', 'propellantReady', 'weatherWindow', 'flightReview']
      : ['assembled', 'propellantReady', 'weatherWindow'];

  function handleLaunch() {
    if (mission.confidence < 100 && !window.confirm(`Launch at ${formatPercent(mission.confidence)}? Success is not guaranteed.`)) {
      return;
    }
    launchSounding();
  }

  return (
    <div className="sounding-mission__inflight">
      <div className="sounding-mission__header">
        {rocket.name}
        {mission.contractId && <span className="sounding-mission__contract-tag"> · contract</span>}
      </div>
      {/* T-21/T-22 (NARRATIVE §9 v3.7): purpose blurb — why launch this, what do I get,
          a real gap found in play since the checklist alone doesn't say. */}
      <div className="building-tile__description">
        {narrativeText(mission.rocketId === 's2' ? 'T-22' : 'T-21')}
      </div>
      <div className="sounding-mission__confidence">Confidence: {formatPercent(mission.confidence)}</div>
      <div className="sounding-mission__checklist">
        {items.map((item) => {
          if (item === 'assembled') {
            return <ChecklistRow key={item} label={CHECKLIST_LABELS[item]} done={mission.checklist.assembled} process={assemblyProcess} />;
          }
          if (item === 'propellantReady') {
            return (
              <ChecklistRow key={item} label={CHECKLIST_LABELS[item]} done={mission.checklist.propellantReady}>
                <span className="checklist-row__note">
                  <CostLabel cost={{ propellant: Math.round(propellant) }} />/<CostLabel cost={{ propellant: requiredPropellant }} />
                </span>
              </ChecklistRow>
            );
          }
          if (item === 'weatherWindow') {
            return (
              <ChecklistRow
                key={item}
                label={CHECKLIST_LABELS[item]}
                done={mission.checklist.weatherWindow}
                process={weatherProcess}
                radar
              >
                {!weatherProcess && (
                  <button type="button" className="upgrade-button" onClick={startWeatherCheck}>
                    Check weather
                  </button>
                )}
              </ChecklistRow>
            );
          }
          // flightReview (S-2 only)
          return (
            <ChecklistRow key={item} label={CHECKLIST_LABELS[item]} done={mission.checklist.flightReview}>
              <button
                type="button"
                className="upgrade-button"
                disabled={research < 20}
                onClick={payFlightReview}
              >
                Pay (<CostLabel cost={{ research: 20 }} />)
              </button>
            </ChecklistRow>
          );
        })}
      </div>
      <button
        type="button"
        className="countdown-button"
        disabled={mission.committedRoll === null}
        onClick={handleLaunch}
      >
        {mission.committedRoll === null ? 'Complete the checklist' : `Launch at ${formatPercent(mission.confidence)}`}
      </button>
    </div>
  );
}

/** ECONOMY §7a / SPRINTS Sprint 6: the sounding-rocket mini launch loop, shown once the
 * Test Stand and Launch Rail are both built (App.tsx gates rendering this). Sprint 9.5:
 * gained a dedicated result view (mirrors LaunchSequencePanel's own showResult/
 * dismissedLaunchId pattern exactly) instead of falling straight back to the picker. */
export function SoundingMissionPanel() {
  const hasMission = useGameStore((s) => s.mission.sounding !== null);
  const launches = useGameStore(useShallow((s) => s.mission.launches));
  const [dismissedLaunchId, setDismissedLaunchId] = useState<string | null>(null);

  const latestLaunch = [...launches].reverse().find((l) => l.missionType === 's1' || l.missionType === 's2');
  const showResult = !hasMission && latestLaunch && latestLaunch.id !== dismissedLaunchId;

  return (
    <div className="research-panel sounding-mission">
      <div className="research-panel__header">
        {hasMission ? 'Sounding rocket mission' : 'Launch a sounding rocket'}
      </div>
      {showResult && latestLaunch ? (
        <ResultCard launch={latestLaunch} onDismiss={() => setDismissedLaunchId(latestLaunch.id)} />
      ) : hasMission ? (
        <InFlightMission />
      ) : (
        <MissionPicker />
      )}
    </div>
  );
}
