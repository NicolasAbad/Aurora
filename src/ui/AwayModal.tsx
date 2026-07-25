import { useAwaySummary } from '../state/persistStore';
import { formatAmount } from '../core/format';

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}

// UI_SPEC §3.6: modal on open when >5 min elapsed (see AWAY_SUMMARY_THRESHOLD_MS in
// persistStore.ts, which decides whether `summary` is non-null at all).
export function AwayModal() {
  const summary = useAwaySummary((s) => s.summary);
  const dismiss = useAwaySummary((s) => s.dismiss);
  if (!summary) return null;

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
        <ul className="away-modal__gains">
          <li>Funding: +{formatAmount(summary.fundingGained)}</li>
          <li>Research: +{formatAmount(summary.researchGained)}</li>
        </ul>
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
