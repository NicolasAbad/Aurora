import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { activePendingContracts } from '../core/contracts';
import { isSoundingRocketUnlocked } from '../core/soundingMission';
import { progressFraction, remainingMs } from '../core/time';
import { SOUNDING_ROCKETS, type SoundingRocketDef } from '../data/soundingRockets';
import { TIER0_PAYLOAD_EXTRA_HARDWARE, TIER0_PAYLOAD_EXTRA_PROPELLANT } from '../data/contracts';
import { formatDuration, formatPercent } from '../core/format';
import { CostLabel } from './CostLabel';
import { useNow } from './useNow';
import type { Process, SoundingChecklistItemId } from '../core/types';

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
}

function ChecklistRow({ label, done, process, children }: ChecklistRowProps) {
  return (
    <div className={`checklist-row ${done ? 'checklist-row--done' : ''}`}>
      <span className="checklist-row__mark">{done ? '✓' : '○'}</span>
      <span className="checklist-row__label">{label}</span>
      {!done && process && <ChecklistRing process={process} />}
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
              <ChecklistRow key={item} label={CHECKLIST_LABELS[item]} done={mission.checklist.weatherWindow} process={weatherProcess}>
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
 * Test Stand and Launch Rail are both built (App.tsx gates rendering this). */
export function SoundingMissionPanel() {
  const hasMission = useGameStore((s) => s.mission.sounding !== null);
  return (
    <div className="research-panel sounding-mission">
      <div className="research-panel__header">
        {hasMission ? 'Sounding rocket mission' : 'Launch a sounding rocket'}
      </div>
      {hasMission ? <InFlightMission /> : <MissionPicker />}
    </div>
  );
}
