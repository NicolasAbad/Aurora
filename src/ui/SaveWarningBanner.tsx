import { useSaveWarning } from '../state/persistStore';
import { narrativeText } from '../data/narrative';

/** Sprint 11 save-migration audit (NARRATIVE T-30): boot found a save on disk that
 * couldn't be read (corrupt JSON or an unrecognized schema version) — a real save, not
 * just "no save yet," so this must never be silent. Reuses the same dismissible-banner
 * shape FirstEntryTip already established. */
export function SaveWarningBanner() {
  const corrupted = useSaveWarning((s) => s.corrupted);
  const dismiss = useSaveWarning((s) => s.dismiss);

  if (!corrupted) return null;
  return (
    <div className="first-entry-tip">
      <span>{narrativeText('T-30')}</span>
      <button type="button" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
