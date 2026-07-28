import { useAwaySummary } from '../state/persistStore';
import { formatAmount } from '../core/format';
import { RESOURCE_ICON, RESOURCE_NAME } from '../data/resourceNames';

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}

// ECONOMY §12-style resource line: icon + full name (this modal is a "reading about a
// resource" context, UI_SPEC §4's rule for where full names belong), skipped entirely
// when nothing was gained (a 0 line for Materials on a save with no Supply Depot yet
// would just be noise).
const GAIN_RESOURCES = [
  { key: 'fundingGained', id: 'funding' },
  { key: 'researchGained', id: 'research' },
  { key: 'materialsGained', id: 'materials' },
  { key: 'hardwareGained', id: 'hardware' },
  { key: 'propellantGained', id: 'propellant' },
  { key: 'reputationGained', id: 'reputation' },
  { key: 'flightxpGained', id: 'flightxp' },
] as const;

// UI_SPEC §3.6: modal on open when >5 min elapsed (see AWAY_SUMMARY_THRESHOLD_MS in
// persistStore.ts, which decides whether `summary` is non-null at all).
export function AwayModal() {
  const summary = useAwaySummary((s) => s.summary);
  const dismiss = useAwaySummary((s) => s.dismiss);
  if (!summary) return null;

  const gains = GAIN_RESOURCES.filter(({ key }) => summary[key] > 0);

  return (
    <div className="away-modal-backdrop">
      <div className="away-modal" role="dialog" aria-label="While you were away">
        <h2>While you were away</h2>
        <p>You were gone for {formatDuration(summary.elapsedMs)}.</p>
        {summary.capped && (
          <p className="away-modal__note">
            Offline progress caps at 10h — the rest of that time wasn&apos;t compensated.
          </p>
        )}
        {gains.length > 0 && (
          <ul className="away-modal__gains">
            {gains.map(({ key, id }) => (
              <li key={id}>
                <span title={RESOURCE_NAME[id]}>{RESOURCE_ICON[id]}</span> {RESOURCE_NAME[id]}: +
                {formatAmount(summary[key])}
              </li>
            ))}
          </ul>
        )}
        {summary.completedProcessLabels.length > 0 && (
          <div className="away-modal__section">
            <div className="away-modal__section-title">Finished while you were away</div>
            <ul className="away-modal__completed">
              {summary.completedProcessLabels.map((label, i) => (
                <li key={i}>{label}</li>
              ))}
            </ul>
          </div>
        )}
        {summary.newRecordNames.length > 0 && (
          <div className="away-modal__section">
            <div className="away-modal__section-title">Records earned</div>
            <ul className="away-modal__completed">
              {summary.newRecordNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        )}
        {summary.stoppage && (
          <p className="away-modal__stoppage">
            Payroll was unpaid for {formatDuration(summary.stoppage.durationMs)} during this
            time — staffed production was paused.
          </p>
        )}
        <button type="button" onClick={dismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
