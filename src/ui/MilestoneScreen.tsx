// UI_SPEC §3 screen 8 (Sprint 10 task 3, NEW): the v1 milestone screen. Fires once, on
// Aurora II's first success (the same moment N-16 fires), full-screen, dismissible, never
// shown again — a chapter-close, explicitly NOT a game-over (contracts, XP nodes, and
// repeat launches all stay fully playable after dismissal, per GDD §0's no-reset-prestige
// pillar). Mirrors ui/AwayModal.tsx's backdrop+panel shape, the only other full-viewport
// takeover in the app.
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, useAwaySummary } from '../state/persistStore';
import { hasAuroraIISuccess } from '../core/auroraMission';
import { RECORD_DEFS } from '../core/records';
import { narrativeText } from '../data/narrative';
import { formatAmount, formatDuration } from '../core/format';
import type { LaunchRecord, RecordId } from '../core/types';

const LAUNCH_TYPE_LABELS: Partial<Record<LaunchRecord['missionType'], string>> = {
  s1: 'S-1 sounding flights',
  s2: 'S-2 Kármán flights',
  auroraI: 'Aurora I',
  auroraII: 'Aurora II',
  contract: 'Contracts fulfilled',
};

function launchCounts(launches: LaunchRecord[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const l of launches) {
    if (!l.success) continue;
    counts.set(l.missionType, (counts.get(l.missionType) ?? 0) + 1);
  }
  return Object.entries(LAUNCH_TYPE_LABELS)
    .map(([type, label]) => ({ label, count: counts.get(type as LaunchRecord['missionType']) ?? 0 }))
    .filter((row) => row.count > 0);
}

export function MilestoneScreen() {
  const launches = useGameStore(useShallow((s) => s.mission.launches));
  const records = useGameStore(useShallow((s) => s.records));
  // `first_pitch` (state/telemetry.ts) is the earliest event tracked for any save — the
  // closest thing to a "game started at" timestamp without inventing a new schema field
  // just for this one stat. Absent on a save with no telemetry history; the line is
  // omitted rather than showing a wrong number (same "graceful degradation over invented
  // data" call as every other additive-optional field in this codebase).
  const firstPitchAt = useGameStore((s) => s.telemetry.find((e) => e.name === 'first_pitch')?.timestamp);
  const lifetimeFunding = useGameStore((s) => s.resources.funding.lifetimeEarned);
  const dismissed = useGameStore((s) => s.economyFlags.milestoneScreenDismissed ?? false);
  const dismiss = useGameStore((s) => s.dismissMilestoneScreen);
  // Both this and AwayModal can become eligible from the same offline catch-up (Aurora II
  // resolving while the player was away >5 min) — stack them sequentially, not on top of
  // each other: AwayModal first, this one appears once it's dismissed and `summary` clears.
  const awayModalShowing = useAwaySummary((s) => s.summary !== null);

  if (dismissed || awayModalShowing || !hasAuroraIISuccess(launches)) return null;

  const counts = launchCounts(launches);
  const recordNames = records
    .map((id) => RECORD_DEFS[id as RecordId]?.name)
    .filter((name): name is string => !!name);
  const playTimeMs = firstPitchAt != null ? Date.now() - firstPitchAt : null;

  return (
    <div className="milestone-screen-backdrop">
      <div className="milestone-screen" role="dialog" aria-label="Program milestone">
        <div className="milestone-screen__badge">Program milestone</div>
        <p className="milestone-screen__narrative">{narrativeText('N-16')}</p>

        <ul className="milestone-screen__stats">
          {counts.map(({ label, count }) => (
            <li key={label}>
              {label}: {count}
            </li>
          ))}
          <li>Program Records earned: {recordNames.length}</li>
          {playTimeMs != null && <li>Play time: {formatDuration(playTimeMs)}</li>}
          <li>Total Funding raised: ${formatAmount(lifetimeFunding)}</li>
        </ul>

        {recordNames.length > 0 && (
          <div className="milestone-screen__section">
            <div className="milestone-screen__section-title">Records earned</div>
            <ul className="milestone-screen__records">
              {recordNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="milestone-screen__teaser">{narrativeText('T-29')}</p>

        <button type="button" onClick={dismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
